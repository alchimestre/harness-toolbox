"""Run with bench/.venv/bin/python bench/skillopt/test_task_env.py; no network, no model calls."""

import tempfile
from pathlib import Path

import task_env

scratch = Path(tempfile.mkdtemp())
parts = scratch / "run.parts"

parts.write_text("5/7\n")
assert task_env.checks_fraction(parts, passed=True) == 5 / 7
# check-task.js prints nothing; scoring a passing run as 0 would train against it.
parts.write_text("")
assert task_env.checks_fraction(parts, passed=True) == 1.0
assert task_env.checks_fraction(parts, passed=False) == 0.0
assert task_env.checks_fraction(scratch / "missing.parts", passed=True) == 1.0

# The dataset comes from committed fixtures alone; every kind has its base prompt and a real assignment.
items = task_env.build_items(reps=1)
kinds = {item["task_type"] for item in items}
assert {"tools", "task", "explore", "callers", "expiry", "guard"} <= kinds
assert all("node test.js" in item["question"] for item in items if not item["variant"])
print("ok")
