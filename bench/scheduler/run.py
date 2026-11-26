#!/usr/bin/env python3
"""Runs one load case through a copy of src/subagent-scheduler.pl built with a candidate policy.

usage: run.py <policy-file> <out-dir> <case>     run.py seed
A policy file holds `NAME = value` lines for the constants in TUNABLE; `seed` prints the committed values.
The copy queues in its own directory, so the machine-wide scheduler is not involved: run one case at a time.
Prints one JSON summary line: throughput, the cap's range, and the limits the machine broke while it ran.
"""
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

BENCH = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BENCH / "small"))
import score as small_score  # noqa: E402
SCHEDULER = BENCH.parent / "src" / "subagent-scheduler.pl"
CASES = {case["id"]: case for case in json.loads((Path(__file__).with_name("cases.json")).read_text())}
MODEL = "anthropic/claude-haiku-5-5"
SAMPLE_SECONDS = 1
SECONDS_PER_MINUTE = 60
WRONG_RESPONDER = -1
TAIL_FRACTION = 0.95
QUIET_SAMPLES = 10
QUIET_TIMEOUT_SECONDS = 3600
# Limits a policy must hold, measured here and fixed so a candidate cannot loosen them.
PROBE_P95_LIMIT_MS = 40
PRESSURE_LIMIT = 1
SWAPOUT_LIMIT = 0
# Allowed range per tunable constant; the control loop's sampling alone takes over a second per tick.
TUNABLE = {
    "DEFAULT_SLOTS": (1, 32),
    "POLL_SECONDS": (0.05, 5),
    "START_SPACING_SECONDS": (0, 5),
    "TICK_SECONDS": (1.5, 10),
    "GROW_INTERVAL_SECONDS": (0, 120),
    "BACKOFF_INTERVAL_SECONDS": (0, 120),
    "BACKOFF_FRACTION": (0.05, 0.9),
    "CPU_IDLE_GROW_PCT": (0, 100),
    "CPU_IDLE_FLOOR_PCT": (0, 100),
    "SATURATED_TICKS": (1, 20),
    "AVAILABLE_MEMORY_FLOOR": (0, 0.9),
    "SWAPOUT_PAGES_LIMIT": (0, 100000),
    "PROBE_LIMIT_MS": (5, 500),
}
POLICY_LINE = re.compile(r"^\s*([A-Z_]+)\s*=\s*([0-9.]+)\s*$")


def main():
    if sys.argv[1:] == ["seed"]:
        print(seed_policy(), end="")
        return
    policy_file, out_dir, case_id = sys.argv[1:]
    summary = run_case(Path(policy_file).read_text(), Path(out_dir).resolve(), CASES[case_id])
    print(json.dumps(summary), flush=True)


def seed_policy():
    source = SCHEDULER.read_text()
    return "".join(f"{name} = {constant(name).search(source).group(1)}\n" for name in TUNABLE)


def constant(name):
    return re.compile(rf"^use constant {name} => ([0-9.]+);", re.M)


def parse_policy(text):
    """Raises ValueError on an unknown name or a value outside its range; other text is ignored."""
    policy = {}
    for line in text.splitlines():
        match = POLICY_LINE.match(line)
        if not match:
            continue
        name, value = match.group(1), float(match.group(2))
        if name not in TUNABLE:
            raise ValueError(f"{name} is not a tunable constant")
        low, high = TUNABLE[name]
        if not low <= value <= high:
            raise ValueError(f"{name} = {value:g} is outside {low}..{high}")
        policy[name] = match.group(2)
    return policy


def build_scheduler(policy_text, script):
    source = SCHEDULER.read_text()
    for name, value in parse_policy(policy_text).items():
        source, replaced = constant(name).subn(f"use constant {name} => {value};", source)
        if replaced != 1:
            raise ValueError(f"{name} is not defined once in {SCHEDULER.name}")
    script.write_text(source)


def run_case(policy_text, out_dir, case):
    out_dir.mkdir(parents=True, exist_ok=True)
    script = out_dir / "scheduler.pl"
    build_scheduler(policy_text, script)
    queue_dir = out_dir / "queue"
    shutil.rmtree(queue_dir, ignore_errors=True)
    cells_dir = Path(tempfile.mkdtemp())
    wait_for_quiet()
    base = sample(queue_dir)
    samples = []
    stop = threading.Event()
    sampler = threading.Thread(target=sample_until, args=(stop, samples, queue_dir))
    sampler.start()
    started = time.monotonic()
    try:
        with ThreadPoolExecutor(case["owners"]) as owners:
            runs = list(owners.map(lambda index: run_owner(case, index, script, queue_dir, cells_dir),
                                   range(case["owners"])))
    finally:
        wall = time.monotonic() - started
        stop.set()
        sampler.join()
        subprocess.run(["pkill", "-f", f"{script} --control"])
        shutil.rmtree(cells_dir, ignore_errors=True)
    (out_dir / "samples.json").write_text(json.dumps(samples))
    summary = summarize(case, wall, runs, base, samples)
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    return summary


def wait_for_quiet():
    """Outside memory pressure makes every policy back off to one slot; such a case is missing data, not a score."""
    deadline = time.monotonic() + QUIET_TIMEOUT_SECONDS
    quiet = 0
    while quiet < QUIET_SAMPLES:
        if time.monotonic() > deadline:
            raise RuntimeError(f"memory pressure stayed above level {PRESSURE_LIMIT} for {QUIET_TIMEOUT_SECONDS}s")
        quiet = quiet + 1 if pressure_level() <= PRESSURE_LIMIT else 0
        time.sleep(SAMPLE_SECONDS)


def pressure_level():
    pressure = subprocess.run(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"], capture_output=True, text=True)
    return int(pressure.stdout.strip() or 0)


def run_owner(case, owner_index, script, queue_dir, cells_dir):
    time.sleep(owner_index * case["join_gap_s"])
    prompts = case.get("prompts") or sorted(path.stem for path in (BENCH / case["bench"] / "prompts").glob("*.txt"))
    started = time.monotonic()
    with ThreadPoolExecutor(case["in_flight"]) as pool:
        exits = list(pool.map(
            lambda cell: run_cell(case, f"owner{owner_index}", prompts[cell % len(prompts)], cell, script, queue_dir,
                                  cells_dir),
            range(case["cells"])))
    return {"exits": exits, "wall_s": time.monotonic() - started}


def run_cell(case, owner, prompt, cell, script, queue_dir, cells_dir):
    """Returns 0 only for a run that exited 0 and was answered by the requested model; a fallback model runs at another speed."""
    tag = cells_dir / f"{owner}_{cell}"
    env = {name: value for name, value in os.environ.items() if not name.startswith("SUBAGENT_SCHEDULER_")}
    env |= {"SUBAGENT_SCHEDULER_DIR": str(queue_dir), "SUBAGENT_SCHEDULER_OWNER": owner, "RUN_TAG": str(tag)}
    run_sh = BENCH / case["bench"] / "run.sh"
    model = case.get("model", MODEL)
    # omp reads piped stdin at startup: an inherited open pipe (a supervised service) hangs every cell forever.
    status = subprocess.run(["perl", str(script), "bash", str(run_sh), prompt, model, str(cell)], env=env,
                            stdin=subprocess.DEVNULL, capture_output=True).returncode
    if status != 0:
        return status
    _cost, _calls, _errors, responders, _answer = small_score.read_run(f"{tag}.jsonl")
    return 0 if responders == {model.split(":")[0]} else WRONG_RESPONDER


def sample_until(stop, samples, queue_dir):
    while not stop.is_set():
        samples.append(sample(queue_dir))
        stop.wait(SAMPLE_SECONDS)


def sample(queue_dir):
    probe_started = time.monotonic()
    subprocess.run(["/usr/bin/true"])
    probe_ms = (time.monotonic() - probe_started) * 1000
    vm_stat = subprocess.run(["vm_stat"], capture_output=True, text=True).stdout
    swapouts = re.search(r"^Swapouts:\s+(\d+)", vm_stat, re.M)
    pressure = subprocess.run(["sysctl", "-n", "kern.memorystatus_vm_pressure_level"], capture_output=True, text=True)
    cap_file = queue_dir / "cap"
    return {"probe_ms": probe_ms, "idle": cpu_idle(), "pressure": int(pressure.stdout.strip() or 0),
            "swapouts": int(swapouts.group(1)) if swapouts else 0,
            "cap": int(cap_file.read_text() or 0) if cap_file.exists() else None}


def cpu_idle():
    text = subprocess.run(["top", "-l", "2", "-n", "1", "-s", "1"], capture_output=True, text=True).stdout
    idles = re.findall(r"CPU usage:.*?([\d.]+)% idle", text)
    return float(idles[-1]) if idles else None


def summarize(case, wall, runs, base, samples):
    exits = [code for run in runs for code in run["exits"]]
    valid = exits.count(0)
    probes = sorted(point["probe_ms"] for point in samples)
    idles = [point["idle"] for point in samples if point["idle"] is not None]
    caps = [point["cap"] for point in samples if point["cap"]]
    measured = {
        "probe_ms_p95": round(probes[min(len(probes) - 1, int(TAIL_FRACTION * len(probes)))], 1),
        "pressure_max": max(point["pressure"] for point in samples),
        "swapouts": samples[-1]["swapouts"] - base["swapouts"],
    }
    limits = {"probe_ms_p95": PROBE_P95_LIMIT_MS, "pressure_max": PRESSURE_LIMIT, "swapouts": SWAPOUT_LIMIT}
    breaches = [name for name, limit in limits.items() if measured[name] > limit]
    if valid < len(exits):
        breaches.append("invalid cells")
    return {
        "case": case["id"], "cells": len(exits), "valid": valid, "wall_s": round(wall),
        "cells_per_min": round(valid / wall * SECONDS_PER_MINUTE, 2),
        "cap_min": min(caps, default=None), "cap_max": max(caps, default=None),
        "cap_mean": round(statistics.mean(caps), 1) if caps else None,
        "cpu_idle_min": min(idles, default=None), "cpu_idle_mean": round(statistics.mean(idles), 1) if idles else None,
        **measured, "owner_wall_s": [round(run["wall_s"]) for run in runs], "breaches": breaches,
    }


if __name__ == "__main__":
    main()
