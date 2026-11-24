"""Trains jev-effort-gate's Jev questions with SkillOpt. Arguments pass through to SkillOpt's train script."""

import json
import os
from pathlib import Path

from scripts import train as skillopt_train
from skillopt.model import claude_backend

import jev_gate

HERE = Path(__file__).resolve().parent
CASES = HERE / "runs" / "cases.json"
SPLIT_DIR = HERE / "runs" / "split-by-fixture"
# Held-out cases come from fixtures SkillOpt never trains on, so test measures transfer.
FIXTURE_SPLIT = {"train": ("tools", "task", "explore"), "val": ("scout",), "test": ("callers", "expiry", "guard")}

os.chdir(HERE)
CASES.parent.mkdir(exist_ok=True)
items = jev_gate.build_items()
CASES.write_text(json.dumps(items, indent=2))
unassigned = {item["task_type"] for item in items} - {kind for kinds in FIXTURE_SPLIT.values() for kind in kinds}
if unassigned:
    raise SystemExit(f"FIXTURE_SPLIT does not place fixture kinds {sorted(unassigned)}")
for split, kinds in FIXTURE_SPLIT.items():
    (SPLIT_DIR / split).mkdir(parents=True, exist_ok=True)
    chosen = [item for item in items if item["task_type"] in kinds]
    (SPLIT_DIR / split / "cases.json").write_text(json.dumps(chosen, indent=2))
skillopt_train._ENV_REGISTRY["jev_gate"] = jev_gate.JevGateAdapter
claude_backend._run_claude_print = jev_gate.run_omp_print
skillopt_train.main()
