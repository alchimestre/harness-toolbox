"""Trains the task agent's prompt body with SkillOpt against bench/small coding fixtures.
Run with --config task.yaml; other arguments pass through to SkillOpt's train script."""

import json
import os
import subprocess
import tempfile
from pathlib import Path

from scripts import train as skillopt_train
from skillopt.model import claude_backend

import jev_gate
import task_env

HERE = Path(__file__).resolve().parent
RUN_DIR = HERE / "runs" / "task"
REPS = 2
# Splits are by fixture, so test measures transfer to code the optimizer never saw.
# Haiku low misses on explore and callers; guard and tools train, task and callers gate, expiry tests.
FIXTURE_SPLIT = {"train": ("explore", "guard", "tools"), "val": ("callers", "task"), "test": ("expiry",)}

os.chdir(HERE)
RUN_DIR.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory() as unpacked:
    subprocess.run(["omp", "agents", "unpack", "--dir", unpacked], check=True, capture_output=True)
    _frontmatter, body = (Path(unpacked) / "task.md").read_text().split("\n---\n", 1)
(RUN_DIR / "seed.md").write_text(body.lstrip())
items = task_env.build_items(REPS)
unassigned = {item["task_type"] for item in items} - {kind for kinds in FIXTURE_SPLIT.values() for kind in kinds}
if unassigned:
    raise SystemExit(f"FIXTURE_SPLIT does not place fixture kinds {sorted(unassigned)}")
for split, kinds in FIXTURE_SPLIT.items():
    (RUN_DIR / "split" / split).mkdir(parents=True, exist_ok=True)
    chosen = [item for item in items if item["task_type"] in kinds]
    (RUN_DIR / "split" / split / "cases.json").write_text(json.dumps(chosen, indent=2))
skillopt_train._ENV_REGISTRY["task"] = task_env.TaskAdapter
claude_backend._run_claude_print = jev_gate.run_omp_print
skillopt_train.main()
