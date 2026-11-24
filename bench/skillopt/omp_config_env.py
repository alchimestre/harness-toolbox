"""SkillOpt environment whose skill is the omp-config agent's prompt body.

A rollout runs bench/omp-config/run.sh on a dev case with the candidate prompt as the agent prompt; the case's
mechanical checks score it. Final-set cases never reach this module.
"""

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import jev_gate

BENCH = Path(__file__).resolve().parents[1] / "omp-config"
sys.path.insert(0, str(jev_gate.SMALL))
import score as small_score  # noqa: E402

MODEL = "anthropic/claude-haiku-5-5:high"
WORKERS = 4
ATTEMPTS = 3


def check_ts(*args):
    output = subprocess.run(["bun", "check.ts", *args], cwd=BENCH, capture_output=True, text=True, check=True)
    return output.stdout.strip()


def case_ids(set_name):
    return check_ts("ids", set_name).split()


def build_items(reps):
    """One item per dev case and repetition; the agent is stochastic, so reps are separate samples."""
    items = []
    for case in case_ids("dev"):
        family = check_ts("family", case)
        question = check_ts("prompt", case)
        for rep in range(1, reps + 1):
            items.append({"id": f"{case}-{rep}", "case": case, "rep": rep, "task_type": family, "question": question})
    return items


class OmpConfigAdapter(jev_gate.JevGateAdapter):
    """Reuses the gate adapter's split loading; only the rollout differs."""

    def rollout(self, env_manager, skill_content, out_dir, **kwargs):
        out = Path(out_dir).resolve()
        out.mkdir(parents=True, exist_ok=True)
        agent_file = out / "agent.md"
        agent_file.write_text(skill_content)
        with ThreadPoolExecutor(WORKERS) as pool:
            results = list(pool.map(lambda item: run_case(item, agent_file, out), env_manager))
        (out / "rollouts.json").write_text(json.dumps(results, indent=2))
        return results


def run_case(item, agent_file, out_dir):
    task_dir = out_dir / "predictions" / item["id"]
    task_dir.mkdir(parents=True, exist_ok=True)
    tag = task_dir / "run"
    run_until_valid(item, agent_file, tag)
    _cost, _calls, _errors, _responders, answer = small_score.read_run(f"{tag}.jsonl")
    outcome = Path(f"{tag}.result").read_text().strip()
    if outcome == "missing":
        raise RuntimeError(f"{item['id']}: checker crashed or run was killed after retries")
    passed = outcome == "pass"
    checks = checks_fraction(Path(f"{tag}.parts"), passed)
    feedback = describe(tag, passed, checks)
    return result(item, agent_file.read_text(), task_dir, answer, int(passed), checks, feedback)


def run_until_valid(item, agent_file, tag):
    """A timeout, omp error or wrong responder is API noise: retry rather than train on it, then raise."""
    env = {**os.environ, "RUN_TAG": str(tag), "AGENT_PROMPT": str(agent_file)}
    command = [str(BENCH / "run.sh"), item["case"], MODEL, str(item["rep"])]
    expected = MODEL.split(":")[0]
    responders = set()
    for _attempt in range(ATTEMPTS):
        status = subprocess.run(command, env=env)
        if status.returncode != 0:
            continue
        _cost, _calls, _errors, responders, _answer = small_score.read_run(f"{tag}.jsonl")
        if responders == {expected}:
            return
    stderr = Path(f"{tag}.err").read_text()[-1000:]
    raise RuntimeError(f"{item['id']}: run failed {ATTEMPTS} times (exit {status.returncode}, "
                       f"answered by {responders}): {stderr}")


def checks_fraction(parts, passed):
    """run.sh writes the check script's last line, 'passed/total'; an empty file scores by the case result alone."""
    text = parts.read_text().strip() if parts.exists() else ""
    if not text:
        return float(passed)
    checked, total = text.split("/")
    return int(checked) / int(total)


def describe(tag, passed, checks):
    feedback = f"Checks passed: {checks:.0%}; case {'pass' if passed else 'fail'}."
    fails = Path(f"{tag}.fails")
    if fails.exists() and fails.read_text().strip():
        feedback += "\nFailing checks:\n" + fails.read_text().strip()
    return feedback


def result(item, skill, task_dir, answer, hard, checks, feedback):
    conversation = [
        {"role": "system", "content": skill},
        {"role": "user", "content": item["question"]},
        {"role": "assistant", "content": answer},
        {"role": "user", "content": f"Grader: {feedback}"},
    ]
    (task_dir / "conversation.json").write_text(json.dumps(conversation, ensure_ascii=False, indent=2))
    return {"id": item["id"], "hard": hard, "soft": checks, "raw_reward": checks, "predicted_answer": answer[-2000:],
            "task_type": item["task_type"], "question": item["question"], "fail_reason": "" if hard else feedback,
            "target_system_prompt": skill, "target_user_prompt": item["question"], "n_turns": 1}
