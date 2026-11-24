"""Run with bench/.venv/bin/python bench/skillopt/test_jev_gate.py; no network, no model calls."""

import tempfile
from pathlib import Path

import jev_gate

POOLED_COST = {"low": 0.62, "medium": 0.77, "high": 1.0}


def case(low, medium, high):
    return {"id": "case", "agent": "task", "prompt": "p", "task_type": "task",
            "pass_rate": {"low": low, "medium": medium, "high": high},
            "runs": dict.fromkeys(jev_gate.LEVELS, 6), "cost": POOLED_COST}


def graded(item, level):
    pick = {"level": level, "reason": "r", "signals": {}}
    return jev_gate.score(item, pick, "skill", Path(tempfile.mkdtemp()))["hard"]


# A pass-rate tie goes to the cheapest level.
assert graded(case(1, 1, 1), "low") == 1
assert graded(case(1, 1, 1), "high") == 0
# One run in six outweighs the 38% cost saving of low over high.
assert graded(case(5 / 6, 1, 1), "medium") == 1
assert graded(case(5 / 6, 5 / 6, 1), "high") == 1

seed = Path(__file__).with_name("seed.md").read_text()
assert set(jev_gate.parse_questions(seed)) == set(jev_gate.SIGNALS)
try:
    jev_gate.parse_questions(seed.replace("## urgent", "## hurry"))
    raise AssertionError("a skill missing a question must be rejected")
except ValueError:
    pass
print("ok")
