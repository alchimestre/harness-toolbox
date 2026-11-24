"""SkillOpt environment whose skill is the writing-rule prompt body.

A rollout runs bench/writing-rule/run.sh on each train or dev-gate case with the candidate appended to
the system prompt; the case's checks score the artifact. Splits come from the case table in cases.md.
"""

import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import jev_gate

BENCH = jev_gate.SMALL.parent / "writing-rule"
SMALL = jev_gate.SMALL
sys.path.insert(0, str(SMALL))
import score as small_score  # noqa: E402

WRITING_MODEL = "anthropic/claude-haiku-5-5:high"
EXPECTED = WRITING_MODEL.split(":")[0]
WRITING_WORKERS = 16
WRITING_ATTEMPTS = 3
SPLIT_OF_TABLE = {"train-dev": "train", "dev-gate": "val"}
CASE_ROW = re.compile(r"^\| ([\w-]+) \|.*\| (train-dev|dev-gate|final) \|$", re.MULTILINE)


def case_splits():
    """Maps each non-final case to its SkillOpt split; final cases never reach training."""
    rows = CASE_ROW.findall((BENCH / "cases.md").read_text())
    return {case: SPLIT_OF_TABLE[split] for case, split in rows if split in SPLIT_OF_TABLE}


def build_items(reps):
    """One item per case and repetition, grouped by split; the agent is stochastic, so reps are separate samples."""
    splits = {"train": [], "val": []}
    for case, split in case_splits().items():
        prompt = (BENCH / "cases" / f"{case}.txt").read_text().strip()
        family = case.split("-")[0]
        for rep in range(1, reps + 1):
            splits[split].append({"id": f"{case}-{rep}", "task_type": family, "case": case, "rep": rep,
                                  "question": prompt})
    return splits


def valid(tag):
    try:
        responders = small_score.read_run(f"{tag}.jsonl")[3]
    except Exception:
        return False
    exit_file = Path(f"{tag}.exit")
    result_file = Path(f"{tag}.result")
    return (responders == {EXPECTED} and exit_file.exists() and result_file.exists()
            and exit_file.read_text().strip() == "0")


def run_case(item, agent_file, tag):
    """A timeout, omp error or fallback model is API noise, so retry rather than train on it."""
    env = {**os.environ, "RUN_TAG": str(tag), "AGENT_PROMPT": str(agent_file)}
    command = [str(BENCH / "run.sh"), item["case"], WRITING_MODEL, str(item["rep"])]
    for _attempt in range(WRITING_ATTEMPTS):
        status = subprocess.run(command, env=env).returncode
        if status == 0 and valid(tag):
            return
    stderr = Path(f"{tag}.err").read_text()[-1000:] if Path(f"{tag}.err").exists() else ""
    raise RuntimeError(f"{item['id']}: run not valid after {WRITING_ATTEMPTS} attempts (exit {status}): {stderr}")


def checks_fraction(parts):
    checked, total = map(int, parts.read_text().strip().split("/"))
    return checked / total


def describe(tag, passed):
    feedback = f"Checks: {'all passed' if passed else 'some failed'}."
    fails = Path(f"{tag}.fails")
    if fails.exists() and fails.read_text().strip():
        feedback += "\nFailing checks:\n" + fails.read_text().strip()
    return feedback


def result(item, skill, task_dir, artifact, hard, soft, feedback):
    conversation = [
        {"role": "system", "content": skill},
        {"role": "user", "content": item["question"]},
        {"role": "assistant", "content": artifact},
        {"role": "user", "content": f"Grader: {feedback}"},
    ]
    (task_dir / "conversation.json").write_text(json.dumps(conversation, ensure_ascii=False, indent=2))
    return {"id": item["id"], "hard": hard, "soft": soft, "raw_reward": soft, "predicted_answer": artifact[-2000:],
            "task_type": item["task_type"], "question": item["question"],
            "fail_reason": "" if hard else feedback, "target_system_prompt": skill,
            "target_user_prompt": item["question"], "n_turns": 1}


def run_and_score(item, agent_file, skill, out_dir):
    task_dir = out_dir / "predictions" / item["id"]
    task_dir.mkdir(parents=True, exist_ok=True)
    tag = task_dir / "run"
    run_case(item, agent_file, tag)
    passed = Path(f"{tag}.result").read_text().strip() == "pass"
    artifact = Path(f"{tag}.out").read_text() if Path(f"{tag}.out").exists() else ""
    return result(item, skill, task_dir, artifact, int(passed), checks_fraction(Path(f"{tag}.parts")),
                  describe(tag, passed))


class WritingRuleAdapter(jev_gate.JevGateAdapter):
    """Reuses the gate adapter's split loading; only the rollout differs."""

    def rollout(self, env_manager, skill_content, out_dir, **kwargs):
        out = Path(out_dir).resolve()
        out.mkdir(parents=True, exist_ok=True)
        agent_file = out / "agent.md"
        agent_file.write_text(skill_content)
        with ThreadPoolExecutor(WRITING_WORKERS) as pool:
            results = list(pool.map(lambda item: run_and_score(item, agent_file, skill_content, out), env_manager))
        (out / "rollouts.json").write_text(json.dumps(results, indent=2))
        return results
