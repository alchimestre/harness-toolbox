---
name: crossroads-survey
description: "Use when asked where a decision model (Jev or another) could replace an LLM or a keyword rule: surveys a repo's prompts, harness code, product code and session history for closed-choice picks, ranks them, pilots the top ones and writes benchmark directories."
---

You find crossroads and rank them. You never build the gate that replaces one.

A crossroads is a pick from a closed, known set of options, made by judging the meaning of text. Each case can be judged on its own. A pick a regex or script could make reliably is not a crossroads.

# Inputs

- **Target**: a repo path. Missing: the current directory.
- **Session history**: yes or no. Missing: yes.
- `TYPESAFE_API_KEY` in the environment. Unset: report `BLOCKED: TYPESAFE_API_KEY unset` and stop.
- `ast-grep` on `PATH`. Missing: `brew install ast-grep`.

`$toolbox` below is this repo's root.

# Survey

1. Export transcript picks, unless session history is off. Run this in a Python `eval` cell, with `project` narrowed to the target's project when the survey covers one repo:

```python
import json, os
out = "<target>/.scratch/crossroads/picks.jsonl"
os.makedirs(os.path.dirname(out), exist_ok=True)
spawns = await archive.calls(tool="task", project="*", since="60d", limit=2000, silent=True)
skills = await archive.calls(tool="read", match=r"^skill://", project="*", since="60d", limit=2000, silent=True)
with open(out, "w") as f:
    for c in spawns:
        for t in c["args"].get("tasks") or []:
            if t.get("agent"):
                f.write(json.dumps({"kind": "agent", "choice": t["agent"], "input": (t.get("task") or "")[:4000], "session": c["session"], "callId": c["callId"]}) + "\n")
    for c in skills:
        name = c["args"]["path"].removeprefix("skill://").split("/")[0]
        f.write(json.dumps({"kind": "skill", "choice": name, "input": c["args"].get("i") or "", "session": c["session"], "callId": c["callId"]}) + "\n")
```

2. Run the survey:

```sh
bun "$toolbox/src/crossroads/survey.ts" survey <target> --picks <target>/.scratch/crossroads/picks.jsonl
```

3. Read `<target>/.scratch/crossroads/<date>/report.md` and report the top 5 of "Ranked", then "Not pilot-ready", with the reason each is not pilot-ready.

Output stays in `<target>/.scratch/crossroads/`. The survey adds `.scratch/` to the target's `.git/info/exclude` when git doesn't already ignore it; it never edits `.gitignore`.

# Report sections

| Section | Holds |
|---|---|
| Changed since last run | New, gone and moved record ids |
| Ranked | Candidates (crossroads p ≥ 0.7) with a complete decision contract, no failed gate |
| Not pilot-ready | Candidates missing part of their contract |
| Review band | Crossroads p 0.3–0.7: a human decides |
| Rejected appendix | Any gate failed |

Rank order: all gates pass, then class (LLM closed choice, prompt instruction, harness branch, rule pretending to judge), then transcript occurrences, then crossroads probability.

# Human edits

Edit the record's line in `candidates.jsonl`, then run `bun "$toolbox/src/crossroads/survey.ts" report <run-dir>`. Edits carry forward to later runs by `id`.

| Field | Edit |
|---|---|
| `fallback.accepted` | `true` once a human accepts the proposed fallback |
| `question` | `instructions`, `labels` (label → one-line criterion), `input` (what the model sees), `reference` (where the right answer comes from) |
| `overrides` | `{"<gate>": "pass"}` or `"fail"` where the classifier is wrong |

Never set `fallback.accepted` or an override yourself: ask the user.

# Pilot

Only for a record in "Ranked". Write `samples.jsonl`, one `{"input", "logged"}` line per real pick; for transcript-backed routing, take them from `picks.jsonl`. Then:

```sh
bun "$toolbox/src/crossroads/survey.ts" pilot <run-dir> <id> samples.jsonl
```

- It takes 30 samples, at least 3 per label where the data allows.
- Disagreements land in `pilot-<id>-disagreements.jsonl`. Ask the user to add a `human` label to each, merge them into `samples.jsonl`, and rerun.
- Pass: agreement ≥ 90% and fallback rate ≤ 20%.

# Benchmark

Only after a pilot pass. Write `cases.jsonl` with the 30 pilot samples (`"split": "pilot"`) and 70 fresh cases (`"split": "holdout"`). Every holdout `reference` comes from the user labelling blind, without seeing either decider's answer, with `"referenceSource": "blind human"`. Then:

```sh
bun "$toolbox/src/crossroads/survey.ts" bench <run-dir> <id> cases.jsonl
```

- Set `currentDecider.command` in `bench/<id>/contract.json`: it reads one case as JSON on stdin and prints `{"label", "usd"}`.
- Hand `bench/<id>/` to the `bench-runner` agent: matrix `model` and `current` × every case × reps 1–5, one `run <decider> <case-id> <rep>` per cell, its JSON line appended to a results file, scored by `score <results.jsonl>`. `score` rejects a missing, duplicate or unknown cell.

| Pass bar (holdout only) | Current decider is an LLM | Current decider is code |
|---|---|---|
| Accuracy | ≤ 2 points below | ≥ 10 points above |
| Cost per decision | ≥ 10x lower | not applied |
| p95 latency | ≤ 2 s | ≤ 2 s |
| Fallback rate | ≤ 20% | ≤ 20% |

# Limits

- Never replace security or permission checks, offline or no-key paths, hot loops, or audit-reproducible decisions.
- "Reads prompt text" in code is guessed from identifier names, not traced.
- Transcript picks use today's routing catalog, not the one live at each pick.
- Code extraction covers Python and TypeScript only.
