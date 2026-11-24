#!/usr/bin/env python3
"""Run repo-audit cases for prompt arms, every run in parallel.

usage: matrix.py run <round_dir> <cases,...> <reps> <arm>=<prompt.md> [...]
Each run's files land in <round_dir>/<arm>/<case>__<rep>.* (run.sh tag prefix).
A cell is valid only when run.sh exits 0 and its transcript is readable and answered by the expected model. matrix.py then writes `<tag>.ok`, and only that marker counts as valid. Artifacts alone never do, because run.sh can write a detail and still exit nonzero. Invalid cells retry with backoff for up to an hour. Re-running a round refills only cells without a marker.
"""
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BENCH = Path(__file__).resolve().parents[3] / "repo-audit"
SCORE_DIR = BENCH.parent / "small"
MODEL = "anthropic/claude-sonnet-5-5:medium"
RESPONDER = MODEL.split(":")[0]
WORKERS_PER_ARM = 16
CELL_DEADLINE_SECONDS = 3600
BACKOFF_MAX_SECONDS = 600

sys.path.insert(0, str(SCORE_DIR))
import score  # noqa: E402


def transcript_ok(tag):
    if not Path(f"{tag}.detail.json").exists() or not Path(f"{tag}.jsonl").exists():
        return False
    try:
        _cost, _calls, _errors, responders, _answer = score.read_run(f"{tag}.jsonl")
    except (OSError, ValueError):
        return False
    return responders == {RESPONDER}


def cell_valid(tag):
    return Path(f"{tag}.ok").exists()


def run_once(arm_dir, prompt, case, rep):
    tag = arm_dir / f"{case}__{rep}"
    if cell_valid(tag):
        return {"case": case, "rep": rep, "attempts": 0, "valid": True}
    env = {**os.environ, "AGENT_PROMPT": str(prompt), "RUN_TAG": str(tag)}
    deadline = time.monotonic() + CELL_DEADLINE_SECONDS
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        status = subprocess.run(["./run.sh", case, MODEL, str(rep)], cwd=BENCH, env=env).returncode
        if status == 0 and transcript_ok(tag):
            Path(f"{tag}.ok").write_text(MODEL)
            return {"case": case, "rep": rep, "attempts": attempt, "valid": True}
        time.sleep(min(BACKOFF_MAX_SECONDS, 60 * attempt))
    return {"case": case, "rep": rep, "attempts": attempt, "valid": False}


def main(argv):
    if argv[0] != "run":
        raise SystemExit(__doc__)
    round_dir, cases, reps = Path(argv[1]).resolve(), argv[2].split(","), int(argv[3])
    arms = dict(pair.split("=", 1) for pair in argv[4:])
    jobs = [(round_dir / arm, Path(prompt).resolve(), case, rep)
            for arm, prompt in arms.items() for case in cases for rep in range(1, reps + 1)]
    for arm in arms:
        (round_dir / arm).mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=WORKERS_PER_ARM * len(arms)) as pool:
        results = list(pool.map(lambda job: run_once(*job), jobs))
    for arm in arms:
        rows = [r for r, job in zip(results, jobs) if job[0].name == arm]
        (round_dir / arm / "valid.json").write_text(json.dumps(rows, indent=1))
    print(f"done: {sum(r['valid'] for r in results)}/{len(results)} valid")


if __name__ == "__main__":
    main(sys.argv[1:])
