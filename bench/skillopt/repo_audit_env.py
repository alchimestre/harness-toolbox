"""SkillOpt environment whose skill is the repo-audit agent's prompt body.

A rollout runs bench/repo-audit/run.sh on a seeded fixture with the candidate prompt appended to the system
prompt; the mechanical check scores the report by seeded defect and decoy, and the repo must stay unchanged.
Only dev cases reach SkillOpt; final cases never do.
"""

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import jev_gate

BENCH = jev_gate.SMALL.parent / "repo-audit"
RUN_SH = BENCH / "run.sh"
REPO_MODEL = "anthropic/claude-sonnet-5-5:medium"
DECOY_PENALTY = 0.25
MAX_DECOYS = 5
# Affine map of recall − penalty × decoys onto 0–1; clipping would make decoy-heavy reports free.
WORST_RAW = -DECOY_PENALTY * MAX_DECOYS
REPO_WORKERS = 16
REPO_ATTEMPTS = 3

sys.path.insert(0, str(jev_gate.SMALL))
import score as small_score  # noqa: E402


def build_items(cases, reps):
    """One item per case and repetition; the agent is stochastic, so reps are separate samples."""
    items = []
    for case in cases:
        repo_id, wording = case.split("-", 1)
        prompt = assignment(case)
        for rep in range(1, reps + 1):
            items.append({"id": f"{case}-{rep}", "task_type": repo_id, "variant": wording, "rep": rep,
                          "question": prompt})
    return items


def assignment(case):
    env = {**os.environ, "PROMPT_ONLY": "1"}
    command = [str(RUN_SH), case, REPO_MODEL, "0"]
    return subprocess.run(command, env=env, capture_output=True, text=True, check=True).stdout.strip()


class RepoAuditAdapter(jev_gate.JevGateAdapter):
    """Reuses the gate adapter's split loading; only the rollout differs."""

    def rollout(self, env_manager, skill_content, out_dir, **kwargs):
        out = Path(out_dir).resolve()
        out.mkdir(parents=True, exist_ok=True)
        agent_file = out / "agent.md"
        agent_file.write_text(skill_content)
        with ThreadPoolExecutor(REPO_WORKERS) as pool:
            results = list(pool.map(lambda item: run_and_score(item, agent_file, skill_content, out), env_manager))
        (out / "rollouts.json").write_text(json.dumps(results, indent=2))
        return results


def run_and_score(item, agent_file, skill, out_dir):
    run_dir = out_dir / "predictions" / item["id"]
    run_dir.mkdir(parents=True, exist_ok=True)
    tag = run_dir / "run"
    run_audit(item, agent_file, tag)
    detail = json.loads(Path(f"{tag}.detail.json").read_text())
    report = Path(f"{tag}.report.md")
    answer = report.read_text() if report.exists() else "(no report written)"
    raw = detail["reward"]
    feedback = describe(item["task_type"], detail)
    return result(item, skill, run_dir, answer, int(detail["hard"]), raw, feedback)


def run_audit(item, agent_file, tag):
    """A timeout, omp error or fallback model is API noise, so retry rather than train on it."""
    env = {**os.environ, "RUN_TAG": str(tag), "AGENT_PROMPT": str(agent_file)}
    command = [str(RUN_SH), f"{item['task_type']}-{item['variant']}", REPO_MODEL, str(item["rep"])]
    expected = REPO_MODEL.split(":")[0]
    responders = set()
    status = None
    for _attempt in range(REPO_ATTEMPTS):
        status = subprocess.run(command, env=env)
        if status.returncode != 0:
            continue
        try:
            _cost, _calls, _errors, responders, _answer = small_score.read_run(f"{tag}.jsonl")
        except (OSError, ValueError):
            continue
        if responders == {expected} and Path(f"{tag}.detail.json").exists():
            return
    stderr = Path(f"{tag}.err").read_text()[-1000:]
    raise RuntimeError(f"{item['id']}: run failed {REPO_ATTEMPTS} times (exit {status.returncode}, "
                       f"answered by {responders}): {stderr}")


def describe(repo_id, detail):
    """Feedback names axes, not seeded defects, so the optimizer learns categories rather than fixture facts."""
    truth = json.loads((BENCH / "truth" / f"{repo_id}.json").read_text())
    fails = detail["fails"]
    missed = [name.removeprefix("missed ") for name in fails if name.startswith("missed ")]
    decoys = [name.removeprefix("decoy ") for name in fails if name.startswith("decoy ")]
    total = len(truth["defects"])
    lines = [f"Found {total - len(missed)}/{total} seeded defects; missed by axis: {axes(truth['defects'], missed)}."]
    lines.append(f"Decoys flagged by axis: {axes(truth['decoys'], decoys)}.")
    if "repo changed" in fails:
        lines.append("The agent changed the repository, which the task forbids.")
    if "no report" in fails:
        lines.append("No report was written.")
    return "\n".join(lines)


def axes(section, names):
    counts = {}
    for name in names:
        axis = section[name]["axis"]
        counts[axis] = counts.get(axis, 0) + 1
    return ", ".join(f"{axis} ×{count}" for axis, count in sorted(counts.items())) or "none"


def result(item, skill, run_dir, answer, hard, raw, feedback):
    conversation = [
        {"role": "system", "content": skill},
        {"role": "user", "content": item["question"]},
        {"role": "assistant", "content": answer},
        {"role": "user", "content": f"Grader: {feedback}"},
    ]
    (run_dir / "conversation.json").write_text(json.dumps(conversation, ensure_ascii=False, indent=2))
    soft = (raw - WORST_RAW) / (1 - WORST_RAW)
    return {"id": item["id"], "hard": hard, "soft": soft, "raw_reward": raw, "predicted_answer": answer[-2000:],
            "task_type": item["task_type"], "question": item["question"], "fail_reason": "" if hard else feedback,
            "target_system_prompt": skill, "target_user_prompt": item["question"], "n_turns": 1}
