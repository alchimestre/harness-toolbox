"""Trains the Ponytail-compatibility skill body with SkillOpt against bench/ponytail-compat cases.
Run with --config ponytail-compat.yaml; other arguments pass through to SkillOpt's train script."""

import importlib
import json
import os
from pathlib import Path

from scripts import train as skillopt_train
from skillopt.model import claude_backend

import jev_gate

HERE = Path(__file__).resolve().parent
CASES_DIR = HERE.parent / "ponytail-compat" / "cases"
RUN_DIR = HERE / "runs" / "ponytail-compat"
REPS = 2
GATE = ("tdd-urgent", "json-terse", "reuse-terse", "approve-urgent", "dedupe-pointed")
FINAL_PREFIXES = ("counter-", "headers-")

env = importlib.import_module("ponytail-compat_env")

os.chdir(HERE)
RUN_DIR.mkdir(parents=True, exist_ok=True)
dev_cases = sorted(path.stem for path in CASES_DIR.glob("*.txt") if not path.stem.startswith(FINAL_PREFIXES))
unknown_gate = set(GATE) - set(dev_cases)
if unknown_gate:
    raise SystemExit(f"GATE names cases missing from dev set: {sorted(unknown_gate)}")
train_cases = [case for case in dev_cases if case not in GATE]
splits = {"train": train_cases, "val": list(GATE)}
for split, cases in splits.items():
    (RUN_DIR / "split" / split).mkdir(parents=True, exist_ok=True)
    items = env.build_items(REPS, cases)
    (RUN_DIR / "split" / split / "cases.json").write_text(json.dumps(items, indent=2))
skillopt_train._ENV_REGISTRY["ponytail-compat"] = env.PonytailAdapter
claude_backend._run_claude_print = jev_gate.run_omp_print
skillopt_train.main()
