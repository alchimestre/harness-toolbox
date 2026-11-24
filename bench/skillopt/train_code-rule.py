"""Trains the code-rule body with SkillOpt against bench/code-rule fixtures.
Run with --config code-rule.yaml; other arguments pass through to SkillOpt's train script."""

import importlib
import json
import os
from pathlib import Path

from scripts import train as skillopt_train
from skillopt.model import claude_backend

# The hyphen keeps the normal import statement from loading this module.
code_rule_env = importlib.import_module("code-rule_env")
import jev_gate

HERE = Path(__file__).resolve().parent
RUN_DIR = HERE / "runs" / "code-rule"
RULES = HERE.parents[1] / "rules" / "code.md"
REPS = 2

os.chdir(HERE)
RUN_DIR.mkdir(parents=True, exist_ok=True)
_frontmatter, body = RULES.read_text().split("\n---\n", 1)
(RUN_DIR / "seed.md").write_text(body.lstrip())
items = code_rule_env.build_items(REPS)
# SkillOpt's loader requires a test/ directory; this bench has no test split, so it stays empty.
for split in (*code_rule_env.SPLITS, "test"):
    (RUN_DIR / "split" / split).mkdir(parents=True, exist_ok=True)
    chosen = [item for item in items if item["split"] == split]
    (RUN_DIR / "split" / split / "cases.json").write_text(json.dumps(chosen, indent=2))
skillopt_train._ENV_REGISTRY["code-rule"] = code_rule_env.CodeRuleAdapter
claude_backend._run_claude_print = jev_gate.run_omp_print
skillopt_train.main()
