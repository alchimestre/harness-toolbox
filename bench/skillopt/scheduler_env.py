"""SkillOpt environment whose skill is the subagent scheduler's policy: its tunable constants.

A rollout runs each load case of bench/scheduler through a scheduler built with the candidate constants.
The reward is throughput relative to the seed policy on the same case, halved when the machine broke a
responsiveness or memory limit. Cases run one at a time: they measure the machine, so they cannot share it.
A case with invalid cells is missing data and is rerun, never scored.
"""

import json
import sys
import time
from pathlib import Path

import jev_gate

BENCH = Path(__file__).resolve().parents[1] / "scheduler"
sys.path.insert(0, str(BENCH))
import run as scheduler_bench  # noqa: E402

BASELINE_FILE = Path(__file__).resolve().parent / "runs" / "scheduler" / "baseline.json"
# Soft reward 1.0 = this many times the seed's throughput; the seed itself scores 1 / FULL_REWARD_GAIN.
FULL_REWARD_GAIN = 1.5
WORTHY_GAIN = 1.08
BREACH_FACTOR = 0.5
COOLDOWN_SECONDS = 30
CASE_ATTEMPTS = 3
LOG_TAIL_LINES = 30


def build_items(reps):
    items = []
    for case in scheduler_bench.CASES.values():
        if case["split"] != "dev":
            continue
        load = (f"{case['owners']} owner(s), each keeping {case['in_flight']} runs in flight "
                f"until {case['cells']} runs finished")
        for rep in range(1, reps + 1):
            items.append({"id": f"{case['id']}-{rep}", "case": case["id"], "task_type": case["id"],
                          "question": load, "gate": case["gate"]})
    return items


def run_valid(item, skill, case_dir):
    """Returns the summary, or the reason the policy text cannot be built into a scheduler."""
    for _attempt in range(CASE_ATTEMPTS):
        try:
            summary = scheduler_bench.run_case(skill, case_dir, scheduler_bench.CASES[item["case"]])
        except ValueError as error:
            return None, str(error)
        finally:
            time.sleep(COOLDOWN_SECONDS)
        if summary["valid"] == summary["cells"]:
            return summary, ""
    raise RuntimeError(f"{item['id']}: invalid cells in {CASE_ATTEMPTS} attempts")


def describe(summary, seed_rate, case_dir):
    log = (case_dir / "queue" / "control.log").read_text().splitlines()[-LOG_TAIL_LINES:]
    limits = (f"shell probe p95 {summary['probe_ms_p95']} ms (limit {scheduler_bench.PROBE_P95_LIMIT_MS}), "
              f"memory pressure level {summary['pressure_max']} (limit {scheduler_bench.PRESSURE_LIMIT}), "
              f"swapouts {summary['swapouts']} (limit {scheduler_bench.SWAPOUT_LIMIT})")
    return "\n".join([
        f"Throughput {summary['cells_per_min']} runs/min; the seed policy does {seed_rate}.",
        f"Cap ranged {summary['cap_min']}..{summary['cap_max']}, mean {summary['cap_mean']}.",
        f"CPU idle min {summary['cpu_idle_min']}%, mean {summary['cpu_idle_mean']}%; {limits}.",
        f"Limits broken: {', '.join(summary['breaches']) or 'none'}.",
        "Control loop log (every cap change and the signals behind it):",
        *(log or ["no cap change"]),
    ])


def score(item, skill, out_dir):
    case_dir = out_dir / "predictions" / item["id"]
    seed_rate = json.loads(BASELINE_FILE.read_text())[item["case"]]
    summary, policy_error = run_valid(item, skill, case_dir)
    if summary is None:
        feedback, soft, hard = f"Policy rejected: {policy_error}.", 0.0, 0
    else:
        gain = summary["cells_per_min"] / seed_rate
        clean = not summary["breaches"]
        soft = min(1.0, gain / FULL_REWARD_GAIN) * (1 if clean else BREACH_FACTOR)
        hard = int(clean and gain >= WORTHY_GAIN)
        feedback = describe(summary, seed_rate, case_dir)
    conversation = [
        {"role": "system", "content": skill},
        {"role": "user", "content": item["question"]},
        {"role": "assistant", "content": feedback},
    ]
    (case_dir / "conversation.json").write_text(json.dumps(conversation, indent=2))
    return {"id": item["id"], "hard": hard, "soft": soft, "raw_reward": soft, "predicted_answer": feedback,
            "task_type": item["task_type"], "question": item["question"], "fail_reason": "" if hard else feedback,
            "target_system_prompt": skill, "target_user_prompt": item["question"], "n_turns": 1}


class SchedulerAdapter(jev_gate.JevGateAdapter):
    """Reuses the gate adapter's split loading; only the rollout differs."""

    def rollout(self, env_manager, skill_content, out_dir, **kwargs):
        out = Path(out_dir).resolve()
        out.mkdir(parents=True, exist_ok=True)
        results = [score(item, skill_content, out) for item in env_manager]
        (out / "rollouts.json").write_text(json.dumps(results, indent=2))
        return results
