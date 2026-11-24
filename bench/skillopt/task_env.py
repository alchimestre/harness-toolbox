"""SkillOpt environment whose skill is the task agent's prompt body.

A rollout runs bench/small/run.sh on a coding fixture with the candidate prompt appended to the system
prompt; the fixture's hidden checks score it, and editing the decoy src/legacy tree is penalised.
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

TASK_MODEL = "anthropic/claude-haiku-5-5:low"
DECOY_PENALTY = 0.25
# Affine map of checks passed − penalty × decoy edit onto 0–1; clipping would make decoy edits free.
WORST_RAW = -DECOY_PENALTY
TASK_WORKERS = 16
TASK_ATTEMPTS = 3


def build_items(reps):
    """One item per committed fixture or variant and repetition; the agent is stochastic, so reps are separate samples."""
    items = []
    for kind, variant in cases():
        case = f"{kind}-{variant}" if variant else kind
        prompt = assignment(kind, variant)
        for rep in range(1, reps + 1):
            items.append({"id": f"{case}-{rep}", "task_type": kind, "variant": variant, "question": prompt})
    return items


def cases():
    """(kind, variant) for every task-agent fixture in bench/small; variant "" is the runner's base prompt."""
    kinds = ["tools"] + sorted(path.stem.removeprefix("check-") for path in SMALL.glob("check-*.js"))
    found = []
    for kind in kinds:
        found.append((kind, ""))
        found += [(kind, path.stem) for path in sorted((SMALL / "variants" / kind).glob("*.txt"))]
    return found


def assignment(kind, variant):
    env = {**os.environ, "PROMPT_ONLY": "1"}
    command = [str(SMALL / "run.sh"), kind, TASK_MODEL, "0", variant]
    return subprocess.run(command, env=env, capture_output=True, text=True, check=True).stdout.strip()


class TaskAdapter(jev_gate.JevGateAdapter):
    """Reuses the gate adapter's split loading; only the rollout differs."""

    def rollout(self, env_manager, skill_content, out_dir, **kwargs):
        out = Path(out_dir).resolve()
        out.mkdir(parents=True, exist_ok=True)
        agent_file = out / "agent.md"
        agent_file.write_text(skill_content)
        with ThreadPoolExecutor(TASK_WORKERS) as pool:
            results = list(pool.map(lambda item: run_and_score(item, agent_file, skill_content, out), env_manager))
        (out / "rollouts.json").write_text(json.dumps(results, indent=2))
        return results


def run_and_score(item, agent_file, skill, out_dir):
    task_dir = out_dir / "predictions" / item["id"]
    task_dir.mkdir(parents=True, exist_ok=True)
    tag = task_dir / "run"
    run_task(item, agent_file, tag)
    _cost, _calls, _errors, _responders, answer = small_score.read_run(f"{tag}.jsonl")
    passed = Path(f"{tag}.result").read_text().strip() == "pass"
    decoy_edited = Path(f"{tag}.decoy").exists()
    checks = checks_fraction(Path(f"{tag}.parts"), passed)
    raw = checks - DECOY_PENALTY * decoy_edited
    feedback = describe(tag, passed, checks, decoy_edited)
    return result(item, skill, task_dir, answer, int(passed and not decoy_edited), raw, feedback)


def checks_fraction(parts, passed):
    """The check script prints 'passed/total'; a fixture whose script prints nothing scores by test.js alone."""
    text = parts.read_text().strip() if parts.exists() else ""
    if not text:
        return float(passed)
    checked, total = text.split("/")
    return int(checked) / int(total)


def run_task(item, agent_file, tag):
    """Runs one fixture; a timeout, omp error or fallback model is API noise, so retry rather than train on it."""
    env = {**os.environ, "RUN_TAG": str(tag), "AGENT_PROMPT": str(agent_file)}
    command = [str(SMALL / "run.sh"), item["task_type"], TASK_MODEL, "0", item["variant"]]
    expected = TASK_MODEL.split(":")[0]
    responders = set()
    for _attempt in range(TASK_ATTEMPTS):
        status = subprocess.run(command, env=env)
        if status.returncode != 0:
            continue
        _cost, _calls, _errors, responders, _answer = small_score.read_run(f"{tag}.jsonl")
        if responders == {expected}:
            return
    stderr = Path(f"{tag}.err").read_text()[-1000:]
    raise RuntimeError(f"{item['id']}: run failed {TASK_ATTEMPTS} times (exit {status.returncode}, "
                       f"answered by {responders}): {stderr}")


def describe(tag, passed, checks, decoy_edited):
    feedback = f"Hidden checks passed: {checks:.0%}; test.js {'pass' if passed else 'fail'}."
    fails = Path(f"{tag}.fails")
    if fails.exists() and fails.read_text().strip():
        feedback += "\nFailing checks:\n" + fails.read_text().strip()
    if decoy_edited:
        feedback += "\nThe agent edited src/legacy, which the task did not ask for."
    return feedback


def result(item, skill, task_dir, answer, hard, raw, feedback):
    conversation = [
        {"role": "system", "content": skill},
        {"role": "user", "content": item["question"]},
        {"role": "assistant", "content": answer},
        {"role": "user", "content": f"Grader: {feedback}"},
    ]
    (task_dir / "conversation.json").write_text(json.dumps(conversation, ensure_ascii=False, indent=2))
    soft = (raw - WORST_RAW) / (1 - WORST_RAW)
    return {"id": item["id"], "hard": hard, "soft": soft, "raw_reward": raw, "predicted_answer": answer[-2000:],
            "task_type": item["task_type"], "question": item["question"], "fail_reason": "" if hard else feedback,
            "target_system_prompt": skill, "target_user_prompt": item["question"], "n_turns": 1}
