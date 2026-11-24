"""Trains the reviewer agents' prompt body with SkillOpt against bench/review cases.
Run with --config review.yaml; other arguments pass through to SkillOpt's train script."""

import json
import os
from pathlib import Path

from scripts import train as skillopt_train
from skillopt.model import claude_backend

import jev_gate
import review_env

HERE = Path(__file__).resolve().parent
AGENT = HERE.parents[1] / "agents" / "readonly-reviewer.md"
RUN_DIR = HERE / "runs" / "review"
REPS = 2
# Splits are by case, so test measures transfer to code the optimizer never saw.
# Haiku low misses on algo, ledger, authz, uploads, webhooks and migration; each split gets some of them.
CASE_SPLIT = {
    "train": ("algo", "ledger", "authz", "easy", "hard", "gocache", "pydata", "bigrename", "goworker"),
    "val": ("webhooks", "uploads", "subtle", "goledger", "pyjobs"),
    "test": ("migration", "algo2", "pysvc"),
}
os.chdir(HERE)
RUN_DIR.mkdir(parents=True, exist_ok=True)
_frontmatter, body = AGENT.read_text().split("\n---\n", 1)
(RUN_DIR / "seed.md").write_text(body.lstrip())
items = review_env.build_items(REPS)
unassigned = {item["case"] for item in items} - {case for cases in CASE_SPLIT.values() for case in cases}
if unassigned:
    raise SystemExit(f"CASE_SPLIT does not place cases {sorted(unassigned)}")
for split, cases in CASE_SPLIT.items():
    (RUN_DIR / "split" / split).mkdir(parents=True, exist_ok=True)
    chosen = [item for item in items if item["case"] in cases]
    (RUN_DIR / "split" / split / "cases.json").write_text(json.dumps(chosen, indent=2))
skillopt_train._ENV_REGISTRY["review"] = review_env.ReviewAdapter
claude_backend._run_claude_print = jev_gate.run_omp_print
skillopt_train.main()
