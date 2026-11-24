"""SkillOpt environment whose skill is the search-hang agent's prompt body.

A rollout runs bench/search-hang/run.sh on each dev case with the candidate appended to the system
prompt. Every web_search call is walled by bench/search-hang/wall.ts; check.py scores each run on its
mechanical checks. The reward is the share of checks passed (soft); hard means every check passed.
A run that is never answered by the requested model raises instead of scoring as a prompt failure.
"""

import json
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import jev_gate

BENCH = Path(__file__).resolve().parents[1] / "search-hang"
RUN_SH = BENCH / "run.sh"
CASES = json.loads((BENCH / "cases.json").read_text())
TARGET_MODEL = "anthropic/claude-haiku-5-5:high"
RESPONDER = "anthropic/claude-haiku-5-5"
ENV_WORKERS = 16
REFILL_SECONDS = 3600
BACKOFF_FIRST_SECONDS = 30
BACKOFF_MAX_SECONDS = 600


def build_items(reps):
    """One item per dev case and repetition; the agent is stochastic, so reps are separate samples."""
    items = []
    for case in CASES:
        if case["split"] != "dev":
            continue
        for rep in range(1, reps + 1):
            items.append({
                "id": f"{case['id']}-{rep}",
                "case": case["id"],
                "rep": str(rep),
                "task_type": case["kind"],
                "question": case["prompt"],
                "gate": case["gate"],
            })
    return items


def run_once(item, agent_file, tag):
    """Rate limits, timeouts and wrong-model answers are missing data: refill with backoff, never score them."""
    env = {**os.environ, "RUN_TAG": str(tag), "AGENT_PROMPT": str(agent_file)}
    result_file = Path(f"{tag}.result.json")
    deadline = time.monotonic() + REFILL_SECONDS
    backoff = BACKOFF_FIRST_SECONDS
    while True:
        result_file.unlink(missing_ok=True)
        status = subprocess.run([str(RUN_SH), item["case"], TARGET_MODEL, item["rep"]], env=env)
        if status.returncode == 0 and result_file.exists():
            report = json.loads(result_file.read_text())
            if report["responders"] == [RESPONDER]:
                return report
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise RuntimeError(f"{item['id']}: no valid run within {REFILL_SECONDS}s, last exit {status.returncode}")
        time.sleep(min(backoff, remaining))
        backoff = min(backoff * 2, BACKOFF_MAX_SECONDS)


def describe(report):
    failed = [name for name, passed in report["checks"].items() if not passed]
    lines = [
        f"Checks passed: {report['soft']:.0%}. Failed: {', '.join(failed) or 'none'}.",
        f"web_search calls: {report['searches']}; retries after a failed search: {report['retries']}.",
    ]
    if not report["hard"]:
        lines.append("Final answer tail:\n" + report["answer_tail"])
    return "\n".join(lines)


def result(item, skill, task_dir, report, feedback):
    conversation = [
        {"role": "system", "content": skill},
        {"role": "user", "content": item["question"]},
        {"role": "assistant", "content": report["answer_tail"]},
        {"role": "user", "content": f"Grader: {feedback}"},
    ]
    (task_dir / "conversation.json").write_text(json.dumps(conversation, ensure_ascii=False, indent=2))
    return {
        "id": item["id"],
        "hard": int(report["hard"]),
        "soft": report["soft"],
        "raw_reward": report["soft"],
        "predicted_answer": report["answer_tail"],
        "task_type": item["task_type"],
        "question": item["question"],
        "fail_reason": "" if report["hard"] else feedback,
        "target_system_prompt": skill,
        "target_user_prompt": item["question"],
        "n_turns": 1,
    }


def run_and_score(item, agent_file, skill, out_dir):
    task_dir = out_dir / "predictions" / item["id"]
    task_dir.mkdir(parents=True, exist_ok=True)
    report = run_once(item, agent_file, task_dir / "run")
    return result(item, skill, task_dir, report, describe(report))


class SearchHangAdapter(jev_gate.JevGateAdapter):
    """Reuses the gate adapter's split loading; only the rollout differs."""

    def rollout(self, env_manager, skill_content, out_dir, **kwargs):
        out = Path(out_dir).resolve()
        out.mkdir(parents=True, exist_ok=True)
        agent_file = out / "agent.md"
        agent_file.write_text(skill_content)
        with ThreadPoolExecutor(ENV_WORKERS) as pool:
            results = list(pool.map(lambda item: run_and_score(item, agent_file, skill_content, out), env_manager))
        (out / "rollouts.json").write_text(json.dumps(results, indent=2))
        return results
