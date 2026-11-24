"""SkillOpt environment whose skill is the reviewer agents' prompt body.

A rollout runs the candidate prompt through bench/review/run.sh on each case, then the bench's
Sonnet judge decides which planted defects the review states and which decoys it wrongly flags.
"""

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import jev_gate

REVIEW = Path(__file__).resolve().parents[1] / "review"
sys.path.insert(0, str(REVIEW))
import score  # noqa: E402

REVIEWER_MODEL = "anthropic/claude-haiku-5-5:low"
DECOY_PENALTY = 0.25
# Affine map of recall − penalty × flags onto 0–1; clipping instead would make extra false alarms free.
WORST_RAW = -DECOY_PENALTY * max((len(decoys) for decoys in score.DECOYS.values()), default=0)
REVIEW_WORKERS = 16
REVIEW_ATTEMPTS = 3


def build_items(reps):
    """One item per case and repetition; the reviewer is stochastic, so reps are separate samples."""
    items = []
    for case in score.DEFECTS:
        spec = (REVIEW / f"{case}.diff").read_text().splitlines()[0]
        for rep in range(1, reps + 1):
            items.append({"id": f"{case}-{rep}", "case": case, "task_type": case, "question": spec})
    return items


class ReviewAdapter(jev_gate.JevGateAdapter):
    """Reuses the gate adapter's split loading; only the rollout differs."""

    def rollout(self, env_manager, skill_content, out_dir, **kwargs):
        out = Path(out_dir).resolve()
        out.mkdir(parents=True, exist_ok=True)
        agent_file = out / "agent.md"
        agent_file.write_text(skill_content)
        with ThreadPoolExecutor(REVIEW_WORKERS) as pool:
            results = list(pool.map(lambda item: review_and_score(item, agent_file, skill_content, out), env_manager))
        (out / "rollouts.json").write_text(json.dumps(results, indent=2))
        return results


def review_and_score(item, agent_file, skill, out_dir):
    task_dir = out_dir / "predictions" / item["id"]
    task_dir.mkdir(parents=True, exist_ok=True)
    tag = task_dir / "review"
    review = run_review(item["case"], agent_file, tag)
    text = score.final_text(review)
    if not text:
        stderr = Path(f"{tag}.err").read_text()[-1000:]
        return result(item, skill, task_dir, text, 0, WORST_RAW, f"The reviewer produced no final answer. stderr: {stderr}")
    found = score.judged(review, item["case"], text, cache=True)
    defects = score.DEFECTS[item["case"]]
    decoys = score.DECOYS.get(item["case"], {})
    missed = [defects[name] for name in defects if name not in found]
    flagged = [decoys[name] for name in decoys if name in found]
    recall = (len(defects) - len(missed)) / len(defects)
    raw = recall - DECOY_PENALTY * len(flagged)
    feedback = (f"Found {len(defects) - len(missed)} of {len(defects)} planted defects; "
                f"wrongly flagged {len(flagged)} behavior-preserving changes.")
    if missed:
        feedback += "\nMissed defects:\n" + "\n".join(f"- {claim}" for claim in missed)
    if flagged:
        feedback += "\nFalse alarms (the review claimed these, but the change preserves behavior):\n"
        feedback += "\n".join(f"- {claim}" for claim in flagged)
    hard = int(not missed and not flagged)
    return result(item, skill, task_dir, text, hard, raw, feedback)


def run_review(case, agent_file, tag):
    """Runs one review; a timeout, omp error or fallback model is API noise, so retry rather than train on it."""
    env = {**os.environ, "RUN_TAG": str(tag)}
    expected = REVIEWER_MODEL.split(":")[0]
    review = f"{tag}.jsonl"
    responders = set()
    for _attempt in range(REVIEW_ATTEMPTS):
        status = subprocess.run([str(REVIEW / "run.sh"), case, REVIEWER_MODEL, "0", str(agent_file)], env=env)
        if status.returncode != 0:
            continue
        _cost, _output, responders = score.usage(review)
        if responders == {expected}:
            # A reused out_dir would otherwise serve the previous review's cached verdict.
            Path(f"{tag}.judged.json").unlink(missing_ok=True)
            return review
    stderr = Path(f"{tag}.err").read_text()[-1000:]
    raise RuntimeError(f"{case}: review failed {REVIEW_ATTEMPTS} times (exit {status.returncode}, "
                       f"answered by {responders}): {stderr}")


def result(item, skill, task_dir, review, hard, raw, feedback):
    diff = (REVIEW / f"{item['case']}.diff").read_text()
    conversation = [
        {"role": "system", "content": skill},
        {"role": "user", "content": diff},
        {"role": "assistant", "content": review},
        {"role": "user", "content": f"Grader: {feedback}"},
    ]
    (task_dir / "conversation.json").write_text(json.dumps(conversation, ensure_ascii=False, indent=2))
    soft = (raw - WORST_RAW) / (1 - WORST_RAW)
    return {"id": item["id"], "hard": hard, "soft": soft, "raw_reward": raw, "predicted_answer": review[-2000:],
            "task_type": item["task_type"], "question": item["question"], "fail_reason": "" if hard else feedback,
            "target_system_prompt": skill, "target_user_prompt": diff, "n_turns": 1}
