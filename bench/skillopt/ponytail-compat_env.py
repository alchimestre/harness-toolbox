"""SkillOpt environment whose skill is the Ponytail-compatibility prompt body.

A rollout runs bench/ponytail-compat/run.sh on each dev case with the candidate appended after the fixed
Ponytail block; the case's mechanical checks score it as the fraction passed.
"""

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import jev_gate

SMALL = jev_gate.SMALL
sys.path.insert(0, str(SMALL))
import score as small_score  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "ponytail-compat"))
from validity import run_is_valid  # noqa: E402

BENCH = Path(__file__).resolve().parent.parent / "ponytail-compat"
TARGET_MODEL = "anthropic/claude-haiku-5-5:high"
RUN_WORKERS = 6
RUN_ATTEMPTS = 3


def build_items(reps, cases):
    """One item per case and repetition; the agent is stochastic, so reps are separate samples."""
    items = []
    for case in cases:
        fixture = case.split("-", 1)[0]
        prompt = (BENCH / "cases" / f"{case}.txt").read_text().strip()
        for rep in range(1, reps + 1):
            items.append({"id": f"{case}-{rep}", "case": case, "rep": rep, "task_type": fixture, "question": prompt})
    return items


class PonytailAdapter(jev_gate.JevGateAdapter):
    """Reuses the gate adapter's split loading; only the rollout differs."""

    def rollout(self, env_manager, skill_content, out_dir, **kwargs):
        out = Path(out_dir).resolve()
        out.mkdir(parents=True, exist_ok=True)
        agent_file = out / "candidate.md"
        agent_file.write_text(skill_content)
        with ThreadPoolExecutor(RUN_WORKERS) as pool:
            results = list(pool.map(lambda item: run_and_score(item, agent_file, skill_content, out), env_manager))
        (out / "rollouts.json").write_text(json.dumps(results, indent=2))
        return results


def run_and_score(item, agent_file, skill, out_dir):
    task_dir = out_dir / "predictions" / item["id"]
    task_dir.mkdir(parents=True, exist_ok=True)
    tag = task_dir / "run"
    run_case(item, agent_file, tag)
    _cost, _calls, _errors, _responders, answer = small_score.read_run(f"{tag}.jsonl")
    passed = Path(f"{tag}.result").read_text().strip() == "pass"
    checks = checks_fraction(Path(f"{tag}.parts"), passed)
    feedback = describe(tag, checks)
    return result(item, skill, task_dir, answer, int(passed), checks, feedback)


def checks_fraction(parts, passed):
    """check.js prints 'passed/total' as its last line; no output is a missing cell, not a zero."""
    text = parts.read_text().strip() if parts.exists() else ""
    if not text:
        raise RuntimeError(f"{parts}: no check output; rerun the cell")
    checked, total = text.split("/")
    return int(checked) / int(total)


def run_case(item, agent_file, tag):
    """Invalid runs are retried, never scored: the cell must pass run_is_valid or the run raises."""
    env = {**os.environ, "RUN_TAG": str(tag), "AGENT_PROMPT": str(agent_file)}
    command = [str(BENCH / "run.sh"), item["case"], TARGET_MODEL, str(item["rep"])]
    expected = TARGET_MODEL.split(":")[0]
    for _attempt in range(RUN_ATTEMPTS):
        status = subprocess.run(command, env=env)
        if status.returncode == 0 and run_is_valid(tag, expected):
            return
    stderr = Path(f"{tag}.err").read_text()[-1000:]
    raise RuntimeError(f"{item['id']}: run invalid after {RUN_ATTEMPTS} attempts "
                       f"(last exit {status.returncode}): {stderr}")


def describe(tag, checks):
    feedback = f"Mechanical checks passed: {checks:.0%}."
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
