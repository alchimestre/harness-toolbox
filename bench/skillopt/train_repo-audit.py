"""Trains the repo-audit prompt body with SkillOpt against bench/repo-audit seeded fixtures.
Run with --config repo-audit.yaml; other arguments pass through to SkillOpt's train script."""

import json
import os
from pathlib import Path

from scripts import train as skillopt_train
from skillopt.model import claude_backend

import jev_gate
import repo_audit_env

HERE = Path(__file__).resolve().parent
RUN_DIR = HERE / "runs" / "repo-audit"
AGENT_FILE = HERE.parent.parent / "agents" / "repo-audit.md"
REPS = 2
WORDINGS = ("terse", "pointed", "urgent", "casual")
# Train and val are whole fixture families, so val measures transfer to a repo the optimizer never saw.
# The final families c and d never reach SkillOpt.
FAMILY_SPLIT = {"train": ("b",), "val": ("a",), "test": ()}

os.chdir(HERE)
RUN_DIR.mkdir(parents=True, exist_ok=True)
_frontmatter, body = AGENT_FILE.read_text().split("\n---\n", 1)
(RUN_DIR / "seed.md").write_text(body.lstrip())
for split, families in FAMILY_SPLIT.items():
    cases = [f"{family}-{wording}" for family in families for wording in WORDINGS]
    (RUN_DIR / "split" / split).mkdir(parents=True, exist_ok=True)
    items = repo_audit_env.build_items(cases, REPS)
    (RUN_DIR / "split" / split / "cases.json").write_text(json.dumps(items, indent=2))
skillopt_train._ENV_REGISTRY["repo-audit"] = repo_audit_env.RepoAuditAdapter
claude_backend._run_claude_print = jev_gate.run_omp_print
skillopt_train.main()
