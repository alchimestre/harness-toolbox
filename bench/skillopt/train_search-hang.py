"""Trains the search-hang agent's prompt body with SkillOpt against bench/search-hang dev cases.
Run with --config search-hang.yaml; other arguments pass through to SkillOpt's train script.

Splits: the dev gate cases are SkillOpt's val split, the remaining dev cases are train, and there is no
test split. The final set is never shown to the optimizer; it is run once by bench/search-hang/arms.py."""

import importlib
import json
import os
from pathlib import Path

from scripts import train as skillopt_train
from skillopt.model import claude_backend

import jev_gate

search_hang_env = importlib.import_module("search-hang_env")

HERE = Path(__file__).resolve().parent
RUN_DIR = HERE / "runs" / "search-hang"
SKILL_FILE = HERE.parents[1] / "skills" / "search-hang" / "SKILL.md"
REPS = 3

os.chdir(HERE)
RUN_DIR.mkdir(parents=True, exist_ok=True)
_frontmatter, body = SKILL_FILE.read_text().split("\n---\n", 1)
(RUN_DIR / "seed.md").write_text(body.lstrip())

items = search_hang_env.build_items(REPS)
splits = {
    "train": [item for item in items if not item["gate"]],
    "val": [item for item in items if item["gate"]],
    "test": [],
}
for split, chosen in splits.items():
    (RUN_DIR / "split" / split).mkdir(parents=True, exist_ok=True)
    (RUN_DIR / "split" / split / "cases.json").write_text(json.dumps(chosen, indent=2))
skillopt_train._ENV_REGISTRY["search-hang"] = search_hang_env.SearchHangAdapter
claude_backend._run_claude_print = jev_gate.run_omp_print
skillopt_train.main()
