"""Replays fixed-effort Haiku runs to score jev-effort-gate against fixed levels and a
same-mix control. A case is a fixture plus one wording of its assignment: the base prompt
from run.sh, or variants/<kind>/<variant>.txt. Run after run.sh covered every case at low,
medium and high."""

import glob
import itertools
import json
import os
import random
import statistics
import subprocess
import sys

from score import passed, read_run

MODEL = "anthropic_claude-haiku-5-5"
LEVELS = ("low", "medium", "high")
AGENT_FOR_KIND = {"tools": "task", "task": "task", "explore": "task", "scout": "scout"}
PICKS_FILE = "runs/gate-picks.json"
SHUFFLES = 2000


def cases():
    """case -> (kind, run tag prefix, prompt file or None for the base prompt)."""
    found = {kind: (kind, kind, None) for kind in AGENT_FOR_KIND}
    for path in sorted(glob.glob("variants/*/*.txt")):
        kind, variant = path.split("/")[1], os.path.basename(path)[:-4]
        found[f"{kind}-{variant}"] = (kind, f"variants/{kind}-{variant}", path)
    return found


def prompt_of(prefix, prompt_file):
    if prompt_file:
        return open(prompt_file).read().strip()
    path = sorted(glob.glob(f"runs/{prefix}__{MODEL}:medium__*.jsonl"))[0]
    for line in open(path):
        message = json.loads(line).get("message") or {}
        if message.get("role") == "user":
            content = message.get("content")
            return content if isinstance(content, str) else "".join(p.get("text", "") for p in content)
    raise ValueError(f"no user prompt in {path}")


def gate_picks(all_cases):
    picks = json.load(open(PICKS_FILE)) if os.path.exists(PICKS_FILE) else {}
    todo = {
        case: {"agent": AGENT_FOR_KIND[kind], "prompt": prompt_of(prefix, prompt_file)}
        for case, (kind, prefix, prompt_file) in all_cases.items()
        if case not in picks
    }
    if todo:
        output = subprocess.run(["bun", "gate-picks.ts"], input=json.dumps(todo), capture_output=True, text=True, check=True)
        picks |= json.loads(output.stdout)
        open(PICKS_FILE, "w").write(json.dumps(picks, indent=1))
    return picks


def outcomes(all_cases):
    """(case, level) -> list of (passed, cost, secs) over reps."""
    table = {}
    for (case, (kind, prefix, _)), level in itertools.product(all_cases.items(), LEVELS):
        runs = []
        for path in sorted(glob.glob(f"runs/{prefix}__{MODEL}:{level}__*.jsonl")):
            tag = path[5:-6]
            if not os.path.exists(f"runs/{tag}.secs"):
                continue
            cost, _calls, _errors, _responders, answer = read_run(path)
            runs.append((passed(kind, tag, answer), cost, int(open(f"runs/{tag}.secs").read())))
        table[case, level] = runs
    return table


def score(policy, table):
    runs = [run for case, level in policy.items() for run in table[case, level]]
    return (
        sum(run[0] for run in runs) / len(runs),
        statistics.mean(run[1] for run in runs),
        statistics.mean(run[2] for run in runs),
    )


def main():
    all_cases = cases()
    table = outcomes(all_cases)
    missing = [f"{case}:{level}" for (case, level), runs in table.items() if not runs]
    if missing:
        sys.exit(f"missing runs: {', '.join(missing)}")
    picks = gate_picks(all_cases)
    print("| case | gate pick | why | " + " | ".join(f"{level} pass" for level in LEVELS) + " |")
    print("|---|---|---|" + "---|" * len(LEVELS))
    for case in all_cases:
        cells = [f"{sum(r[0] for r in table[case, level])}/{len(table[case, level])}" for level in LEVELS]
        print(f"| {case} | {picks[case]['level']} | {picks[case]['reason']} | " + " | ".join(cells) + " |")

    gate = {case: picks[case]["level"] for case in all_cases}
    policies = {f"fixed {level}": dict.fromkeys(all_cases, level) for level in LEVELS}
    policies["jev gate"] = gate
    # Same levels as the gate, assigned to cases at random: the gate only helps if its picks beat this.
    rng = random.Random(0)
    control = []
    for _ in range(SHUFFLES):
        levels = list(gate.values())
        rng.shuffle(levels)
        control.append(score(dict(zip(all_cases, levels)), table))
    print("\n| policy | pass rate | $ per run | secs per run |")
    print("|---|---|---|---|")
    for name, policy in policies.items():
        rate, cost, secs = score(policy, table)
        print(f"| {name} | {rate:.0%} | {cost:.4f} | {secs:.0f} |")
    rate, cost, secs = (statistics.mean(values) for values in zip(*control))
    gate_rate = score(gate, table)[0]
    beaten = sum(run[0] >= gate_rate for run in control) / SHUFFLES
    print(f"| same-mix shuffle (mean of {SHUFFLES}) | {rate:.0%} | {cost:.4f} | {secs:.0f} |")
    print(f"\nshuffles at or above the gate's pass rate: {beaten:.1%}")


os.chdir(os.path.dirname(os.path.abspath(__file__)))
main()
