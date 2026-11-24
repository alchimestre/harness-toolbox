"""Trains the writing-rule prompt body with SkillOpt against bench/writing-rule cases.
Run with --config writing_rule.yaml; other arguments pass through to SkillOpt's train script."""

import json
import os
from pathlib import Path

from scripts import train as skillopt_train
from skillopt.model import claude_backend

import jev_gate
import writing_rule_env

HERE = Path(__file__).resolve().parent
RUN_DIR = HERE / "runs" / "writing-rule"
REPS = 2

os.chdir(HERE)
RUN_DIR.mkdir(parents=True, exist_ok=True)
# test stays empty: the loader requires the directory, and final cases must never reach training.
for split, items in {**writing_rule_env.build_items(REPS), "test": []}.items():
    (RUN_DIR / "split" / split).mkdir(parents=True, exist_ok=True)
    (RUN_DIR / "split" / split / "cases.json").write_text(json.dumps(items, indent=2))
skillopt_train._ENV_REGISTRY["writing-rule"] = writing_rule_env.WritingRuleAdapter
claude_backend._run_claude_print = jev_gate.run_omp_print
skillopt_train.main()
