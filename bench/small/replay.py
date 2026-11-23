"""Replays fixed-effort Haiku runs to score jev-effort-gate against fixed levels and a
same-mix control. Run after run.sh has covered every kind at low, medium and high."""

import glob
import itertools
import json
import os
import statistics
import subprocess
import sys

from score import passed, read_run

MODEL = "anthropic_claude-haiku-5-5"
LEVELS = ("low", "medium", "high")
AGENT_FOR_KIND = {"tools": "task", "task": "task", "explore": "task", "scout": "scout"}
PICKS_FILE = "runs/gate-picks.json"


def first_prompt(kind):
    path = sorted(glob.glob(f"runs/{kind}__{MODEL}:medium__*.jsonl"))[0]
    for line in open(path):
        message = json.loads(line).get("message") or {}
        if message.get("role") == "user":
            content = message.get("content")
            return content if isinstance(content, str) else "".join(p.get("text", "") for p in content)
    raise ValueError(f"no user prompt in {path}")


def gate_picks():
    if not os.path.exists(PICKS_FILE):
        cases = {kind: {"agent": agent, "prompt": first_prompt(kind)} for kind, agent in AGENT_FOR_KIND.items()}
        output = subprocess.run(["bun", "gate-picks.ts"], input=json.dumps(cases), capture_output=True, text=True, check=True)
        open(PICKS_FILE, "w").write(output.stdout)
    return json.load(open(PICKS_FILE))


def outcomes():
    """(kind, level) -> list of (passed, cost, secs) over reps."""
    table = {}
    for kind, level in itertools.product(AGENT_FOR_KIND, LEVELS):
        runs = []
        for path in sorted(glob.glob(f"runs/{kind}__{MODEL}:{level}__*.jsonl")):
            tag = path[5:-6]
            cost, _calls, _errors, _responders, answer = read_run(path)
            runs.append((passed(kind, tag, answer), cost, int(open(f"runs/{tag}.secs").read())))
        table[kind, level] = runs
    return table


def score(policy, table):
    runs = [run for kind, level in policy.items() for run in table[kind, level]]
    return (
        sum(run[0] for run in runs) / len(runs),
        statistics.mean(run[1] for run in runs),
        statistics.mean(run[2] for run in runs),
    )


def main():
    table = outcomes()
    missing = [f"{kind}:{level}" for (kind, level), runs in table.items() if not runs]
    if missing:
        sys.exit(f"missing runs: {', '.join(missing)}")
    picks = gate_picks()
    print("| kind | gate pick | why | " + " | ".join(f"{level} pass" for level in LEVELS) + " |")
    print("|---|---|---|" + "---|" * len(LEVELS))
    for kind in AGENT_FOR_KIND:
        cells = [f"{sum(r[0] for r in table[kind, level])}/{len(table[kind, level])}" for level in LEVELS]
        print(f"| {kind} | {picks[kind]['level']} | {picks[kind]['reason']} | " + " | ".join(cells) + " |")

    gate = {kind: picks[kind]["level"] for kind in AGENT_FOR_KIND}
    policies = {f"fixed {level}": dict.fromkeys(AGENT_FOR_KIND, level) for level in LEVELS}
    policies["jev gate"] = gate
    shuffles = [dict(zip(AGENT_FOR_KIND, order)) for order in set(itertools.permutations(gate.values()))]
    control = [score(policy, table) for policy in shuffles]
    print("\n| policy | pass rate | $ per run | secs per run |")
    print("|---|---|---|---|")
    for name, policy in policies.items():
        rate, cost, secs = score(policy, table)
        print(f"| {name} | {rate:.0%} | {cost:.4f} | {secs:.0f} |")
    rate, cost, secs = (statistics.mean(values) for values in zip(*control))
    print(f"| same-mix shuffle (mean of {len(shuffles)}) | {rate:.0%} | {cost:.4f} | {secs:.0f} |")


os.chdir(os.path.dirname(os.path.abspath(__file__)))
main()
