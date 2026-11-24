"""SkillOpt environment whose skill is the git-chores agent prompt body.

A rollout runs bench/git-chores/run.sh on one dev fixture with the candidate prompt as the agent prompt.
check.py's hidden checks score it: the soft reward is the fraction of checks passed, the hard reward is
the case's test passing. The final-set cases are never loaded here.
"""

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import jev_gate

SMALL = jev_gate.SMALL
GIT_CHORES = SMALL.parent / "git-chores"
sys.path.insert(0, str(SMALL))
import score as small_score  # noqa: E402

TASK_MODEL = "anthropic/claude-haiku-5-5:low"
TASK_WORKERS = 16
TASK_ATTEMPTS = 3
TRAIN_CASES = (
    "ignore-tracked",
    "ignore-tracked-terse",
    "exclude-local",
    "untrack-nopush",
    "prune-stale",
    "foreign-staged",
    "worktree-dirty",
)
GATE_CASES = ("foreign-urgent", "force-rejected", "secrets-pointed", "clean-everything", "hook-fail")
DEV_CASES = TRAIN_CASES + GATE_CASES
SPLITS = {"train": TRAIN_CASES, "val": GATE_CASES, "test": ()}


def build_items(reps):
    """One item per dev case and repetition; the agent is stochastic, so reps are separate samples."""
    items = []
    for case in DEV_CASES:
        prompt = assignment(case)
        for rep in range(1, reps + 1):
            items.append({"id": f"{case}-{rep}", "task_type": case, "question": prompt})
    return items


def assignment(case):
    env = {**os.environ, "PROMPT_ONLY": "1"}
    command = [str(GIT_CHORES / "run.sh"), case, TASK_MODEL, "1"]
    return subprocess.run(command, env=env, capture_output=True, text=True, check=True).stdout.strip()


class GitChoresAdapter(jev_gate.JevGateAdapter):
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
    run_case(item, agent_file, tag)
    _cost, _calls, _errors, _responders, answer = small_score.read_run(f"{tag}.jsonl")
    passed = Path(f"{tag}.result").read_text().strip() == "pass"
    checks = checks_fraction(Path(f"{tag}.parts"), passed)
    feedback = describe(tag, passed, checks)
    return result(item, skill, task_dir, answer, int(passed), checks, feedback)


def checks_fraction(parts, passed):
    """check.py prints 'passed/total'; a case whose script prints nothing scores by test.js alone."""
    text = parts.read_text().strip() if parts.exists() else ""
    if not text:
        return float(passed)
    checked, total = text.split("/")
    return int(checked) / int(total)


def run_case(item, agent_file, tag):
    """A timeout, omp error or fallback model is API noise, so retry rather than train on it."""
    env = {**os.environ, "RUN_TAG": str(tag), "AGENT_PROMPT": str(agent_file)}
    command = [str(GIT_CHORES / "run.sh"), item["task_type"], TASK_MODEL, "1"]
    expected = TASK_MODEL.split(":")[0]
    responders = set()
    status = None
    for _attempt in range(TASK_ATTEMPTS):
        status = subprocess.run(command, env=env)
        if status.returncode != 0:
            continue
        responders = small_score.read_run(f"{tag}.jsonl")[3]
        if responders == {expected}:
            return
    err = Path(f"{tag}.err")
    stderr = err.read_text()[-1000:] if err.exists() else ""
    raise RuntimeError(f"{item['id']}: run failed {TASK_ATTEMPTS} times (exit {status.returncode}, "
                       f"answered by {responders}): {stderr}")


def describe(tag, passed, checks):
    feedback = f"Hidden checks passed: {checks:.0%}; test {'pass' if passed else 'fail'}."
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
    return {"id": item["id"], "hard": hard, "soft": checks, "raw_reward": checks,
            "predicted_answer": answer[-2000:], "task_type": item["task_type"], "question": item["question"],
            "fail_reason": "" if hard else feedback, "target_system_prompt": skill,
            "target_user_prompt": item["question"], "n_turns": 1}
