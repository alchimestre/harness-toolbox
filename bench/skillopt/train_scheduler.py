"""Trains the subagent scheduler's policy constants with SkillOpt against bench/scheduler dev cases.
Run with --config scheduler.yaml; other arguments pass through to SkillOpt's train script.

Needs runs/scheduler/baseline.json: the seed policy's runs/min per dev case, measured on this machine.
Splits: the dev gate case is SkillOpt's val split, the other dev case is train, and there is no test split."""

import json
import os
from pathlib import Path

from scripts import train as skillopt_train
from skillopt.model import claude_backend

import jev_gate
import scheduler_env

HERE = Path(__file__).resolve().parent
RUN_DIR = HERE / "runs" / "scheduler"
REPS = 1
SEED_HEADER = """# Subagent scheduler policy

The scheduler admits runs into slots up to a cap. A control loop ticks every TICK_SECONDS: it raises the cap by 1
when runs wait, every slot is held, CPU idle is at least CPU_IDLE_GROW_PCT and available memory is at least
AVAILABLE_MEMORY_FLOOR; it cuts the cap by BACKOFF_FRACTION of the running count on swapping above
SWAPOUT_PAGES_LIMIT pages per tick, memory pressure, a no-op spawn slower than PROBE_LIMIT_MS, or CPU idle under
CPU_IDLE_FLOOR_PCT for SATURATED_TICKS ticks. GROW_INTERVAL_SECONDS and BACKOFF_INTERVAL_SECONDS space cap changes.
The cap starts at DEFAULT_SLOTS (limit 32). Waiting runs poll every POLL_SECONDS and start at least
START_SPACING_SECONDS apart. Only the `NAME = value` lines below take effect; keep one line per name.

"""

os.chdir(HERE)
(RUN_DIR / "seed.md").write_text(SEED_HEADER + scheduler_env.scheduler_bench.seed_policy())
items = scheduler_env.build_items(REPS)
splits = {
    "train": [item for item in items if not item["gate"]],
    "val": [item for item in items if item["gate"]],
    "test": [],
}
for split, chosen in splits.items():
    (RUN_DIR / "split" / split).mkdir(parents=True, exist_ok=True)
    (RUN_DIR / "split" / split / "cases.json").write_text(json.dumps(chosen, indent=2))
skillopt_train._ENV_REGISTRY["scheduler"] = scheduler_env.SchedulerAdapter
claude_backend._run_claude_print = jev_gate.run_omp_print
skillopt_train.main()
