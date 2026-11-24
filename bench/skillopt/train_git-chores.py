"""Trains the git-chores agent prompt body with SkillOpt against the 12 dev cases of bench/git-chores.
Run with --config git-chores.yaml; other arguments pass through to SkillOpt's train script.
The final set is never loaded."""

import importlib
import json
import os
from pathlib import Path

from scripts import train as skillopt_train
from skillopt.model import claude_backend

import jev_gate

git_env = importlib.import_module("git-chores_env")

HERE = Path(__file__).resolve().parent
RUN_DIR = HERE / "runs" / "git-chores"
REPS = 2

os.chdir(HERE)
RUN_DIR.mkdir(parents=True, exist_ok=True)
items = git_env.build_items(REPS)
for split, cases in git_env.SPLITS.items():
    split_dir = RUN_DIR / "split" / split
    split_dir.mkdir(parents=True, exist_ok=True)
    chosen = [item for item in items if item["task_type"] in cases]
    (split_dir / "cases.json").write_text(json.dumps(chosen, indent=2))
skillopt_train._ENV_REGISTRY["git-chores"] = git_env.GitChoresAdapter
claude_backend._run_claude_print = jev_gate.run_omp_print
skillopt_train.main()
