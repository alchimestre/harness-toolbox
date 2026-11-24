#!/usr/bin/env python3
"""Run search-hang arms over a case split and print the round tables.

Every arm of a round runs at once, WORKERS_PER_ARM runs per arm. A cell (arm, case, rep) is valid only
when the run exits 0 and the requested model answered. Invalid attempts (rate limit, timeout, crash, wrong
model) are refilled with backoff for up to REFILL_SECONDS; a cell still missing after that is reported and
not scored. Tables compare arms only on cells valid in every arm.

Usage: arms.py --set dev|final --reps N --out DIR --arm NAME=PROMPT_FILE [--arm ...] [--case ID ...] [--tabulate-only]
"""

import argparse
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
CASES = json.loads((HERE / "cases.json").read_text())
MODEL = "anthropic/claude-haiku-5-5:high"
RESPONDER = "anthropic/claude-haiku-5-5"
WORKERS_PER_ARM = 16
REFILL_SECONDS = 3600
BACKOFF_FIRST_SECONDS = 30
BACKOFF_MAX_SECONDS = 600

Cell = tuple[str, int]


def select_cases(split: str, only: list[str]) -> list[dict]:
    chosen = [case for case in CASES if case["split"] == split]
    if only:
        chosen = [case for case in chosen if case["id"] in only]
    return chosen


def result_path(out: Path, arm: str, case_id: str, rep: int) -> Path:
    return out / arm / f"{case_id}__{rep}.result.json"


def read_valid(result: Path) -> dict | None:
    if not result.exists():
        return None
    report = json.loads(result.read_text())
    return report if report.get("responders") == [RESPONDER] else None


def run_cell(job: tuple[Path, str, Path, str, int]) -> tuple[str, str, int, bool]:
    out, arm, prompt_file, case_id, rep = job
    tag = out / arm / f"{case_id}__{rep}"
    tag.parent.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "RUN_TAG": str(tag), "AGENT_PROMPT": str(prompt_file)}
    result = result_path(out, arm, case_id, rep)
    deadline = time.monotonic() + REFILL_SECONDS
    backoff = BACKOFF_FIRST_SECONDS
    while True:
        result.unlink(missing_ok=True)
        proc = subprocess.run(
            [str(HERE / "run.sh"), case_id, MODEL, str(rep)],
            env=env,
            capture_output=True,
            text=True,
        )
        if proc.returncode == 0 and read_valid(result) is not None:
            return arm, case_id, rep, True
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return arm, case_id, rep, False
        time.sleep(min(backoff, remaining))
        backoff = min(backoff * 2, BACKOFF_MAX_SECONDS)


def collect(out: Path, arm: str, cases: list[dict], reps: int) -> dict[Cell, dict]:
    valid: dict[Cell, dict] = {}
    for case in cases:
        for rep in range(1, reps + 1):
            report = read_valid(result_path(out, arm, case["id"], rep))
            if report is not None:
                valid[(case["id"], rep)] = report
    return valid


def shared_cells(per_arm: dict[str, dict[Cell, dict]]) -> set[Cell]:
    return set.intersection(*(set(cells) for cells in per_arm.values()))


def summarise(arm: str, cases: list[dict], reports: dict[Cell, dict]) -> dict:
    gate_ids = {case["id"] for case in cases if case.get("gate")}
    runs = list(reports.values())
    gate_runs = [report for (case_id, _rep), report in reports.items() if case_id in gate_ids]
    failing: dict[str, int] = {}
    for run in runs:
        for name, passed in run["checks"].items():
            if not passed:
                failing[name] = failing.get(name, 0) + 1
    count = max(len(runs), 1)
    return {
        "arm": arm,
        "hard_dev": sum(run["hard"] for run in runs),
        "n_dev": len(runs),
        "hard_gate": sum(run["hard"] for run in gate_runs),
        "n_gate": len(gate_runs),
        "soft": sum(run["soft"] for run in runs) / count,
        "cost_per_run": sum(run["cost"] for run in runs) / count,
        "searches_per_run": sum(run["searches"] for run in runs) / count,
        "retries": sum(run["retries"] for run in runs),
        "failing": failing,
    }


def print_tables(cases: list[dict], reps: int, per_arm: dict[str, dict[Cell, dict]], arms: list[str]) -> None:
    print("| arm | hard dev | hard dev-gate | soft | $/run | searches/run | retries |")
    print("|---|---|---|---|---|---|---|")
    for arm in arms:
        stats = summarise(arm, cases, per_arm[arm])
        print(
            f"| {arm} | {stats['hard_dev']}/{stats['n_dev']} | {stats['hard_gate']}/{stats['n_gate']} "
            f"| {stats['soft']:.3f} | {stats['cost_per_run']:.4f} | {stats['searches_per_run']:.2f} | {stats['retries']} |"
        )
    print()
    print("| case | gate | " + " | ".join(arms) + " |")
    print("|---|---|" + "---|" * len(arms))
    for case in cases:
        cells = []
        for arm in arms:
            case_reports = [per_arm[arm][(case["id"], rep)] for rep in range(1, reps + 1) if (case["id"], rep) in per_arm[arm]]
            cells.append(f"{sum(report['hard'] for report in case_reports)}/{len(case_reports)}")
        print(f"| {case['id']} | {'yes' if case.get('gate') else ''} | " + " | ".join(cells) + " |")
    print()
    print("Failing checks (count of failed runs):")
    for arm in arms:
        print(f"- {arm}: {summarise(arm, cases, per_arm[arm])['failing'] or 'none'}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--set", choices=["dev", "final"], required=True)
    parser.add_argument("--reps", type=int, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--arm", action="append", required=True, help="NAME=PROMPT_FILE")
    parser.add_argument("--case", action="append", default=[])
    parser.add_argument("--tabulate-only", action="store_true")
    args = parser.parse_args()

    arms = dict(item.split("=", 1) for item in args.arm)
    cases = select_cases(args.set, args.case)
    out = args.out.resolve()
    if not args.tabulate_only:
        jobs = [
            (out, arm, Path(prompt).resolve(), case["id"], rep)
            for arm, prompt in arms.items()
            for case in cases
            for rep in range(1, args.reps + 1)
        ]
        with ThreadPoolExecutor(max_workers=WORKERS_PER_ARM * len(arms)) as pool:
            outcomes = list(pool.map(run_cell, jobs))
        print(f"cells: {len(outcomes)}, still missing after refill window: {sum(not ok for *_, ok in outcomes)}", file=sys.stderr)

    per_arm = {arm: collect(out, arm, cases, args.reps) for arm in arms}
    for arm, cells in per_arm.items():
        expected = {(case["id"], rep) for case in cases for rep in range(1, args.reps + 1)}
        missing = sorted(expected - set(cells))
        print(f"missing {arm}: {missing or 'none'}")
    shared = shared_cells(per_arm)
    per_arm = {arm: {cell: report for cell, report in cells.items() if cell in shared} for arm, cells in per_arm.items()}
    print(f"shared valid cells: {len(shared)}")
    print_tables(cases, args.reps, per_arm, list(arms))


if __name__ == "__main__":
    main()
