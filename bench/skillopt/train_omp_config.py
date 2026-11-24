"""Trains the omp-config agent's prompt body with SkillOpt against bench/omp-config dev cases.
Run with --config omp_config.yaml; other arguments pass through to SkillOpt's train script."""

import json
import os
from pathlib import Path

from scripts import train as skillopt_train
from skillopt.model import claude_backend

import jev_gate
import omp_config_env

HERE = Path(__file__).resolve().parent
RUN_DIR = HERE / "runs" / "omp-config"
AGENT = HERE.parents[1] / "agents" / "omp-config.md"
REPS = 2

os.chdir(HERE)
RUN_DIR.mkdir(parents=True, exist_ok=True)
_frontmatter, body = AGENT.read_text().split("\n---\n", 1)
(RUN_DIR / "seed.md").write_text(body.lstrip())
items = omp_config_env.build_items(REPS)
gate = set(omp_config_env.case_ids("gate"))
splits = {
    "train": [item for item in items if item["case"] not in gate],
    "val": [item for item in items if item["case"] in gate],
    "test": [],
}
for split, chosen in splits.items():
    (RUN_DIR / "split" / split).mkdir(parents=True, exist_ok=True)
    (RUN_DIR / "split" / split / "cases.json").write_text(json.dumps(chosen, indent=2))
skillopt_train._ENV_REGISTRY["omp_config"] = omp_config_env.OmpConfigAdapter
claude_backend._run_claude_print = jev_gate.run_omp_print
skillopt_train.main()
