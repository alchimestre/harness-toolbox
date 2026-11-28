---
name: crossroads-survey
description: "Use when asked where a decision model (Jev or another) could replace an LLM or a keyword rule: surveys a repo's prompts, harness code, product code and session history for closed-choice picks, ranks them, pilots the top ones and writes benchmark directories."
---

You find crossroads and rank them. You never build the gate that replaces one.

A crossroads is any place where an agent or program has to decide which path to take based on what it reads. The gates then judge whether a decision model could take that decision: a closed set of options, each case judged on its own, and not reliably decidable by a regex or script.

# Inputs

- **Target**: a repo path. Missing: the current directory.
- **Session history**: yes or no. Missing: yes.
- `TYPESAFE_API_KEY` in the environment. Unset: report `BLOCKED: TYPESAFE_API_KEY unset` and stop.
- `ast-grep` on `PATH`. Missing: `brew install ast-grep`.

`$toolbox` below is this repo's root.

# Survey

1. Export transcript picks, unless session history is off. Run this in a Python `eval` cell, with `project` narrowed to the target's project when the survey covers one repo:

```python
import json, os, re
out = "<target>/.scratch/crossroads/picks.jsonl"
os.makedirs(os.path.dirname(out), exist_ok=True)
spawns = await archive.calls(tool="task", project="*", since="60d", limit=2000, silent=True)
skills = await archive.calls(tool="read", match=r"^skill://", project="*", since="60d", limit=2000, silent=True)
user_turns = {}
async def request_before(call):
    # The read's `i` note names the skill it is reading; the routed input is the user turn before the call.
    if call["file"] not in user_turns:
        user_turns[call["file"]] = await archive.messages(call["file"], kinds=["user"], limit=10000, silent=True)
    earlier = [m for m in user_turns[call["file"]] if m["at"] < call["at"]]
    return earlier[-1] if earlier else None
seen = set()
with open(out, "w") as f:
    for c in spawns:
        for t in c["args"].get("tasks") or []:
            if t.get("agent"):
                f.write(json.dumps({"kind": "agent", "choice": t["agent"], "input": (t.get("task") or "")[:4000], "session": c["session"], "callId": c["callId"]}) + "\n")
    for c in reversed(skills):
        name = re.split(r"[/:]", c["args"]["path"].removeprefix("skill://"))[0]
        turn = await request_before(c)
        if not name or not turn or (c["file"], turn["entry"], name) in seen:
            continue
        seen.add((c["file"], turn["entry"], name))
        f.write(json.dumps({"kind": "skill", "choice": name, "input": turn["text"][:4000], "session": c["session"], "callId": c["callId"]}) + "\n")
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
| `crossroads` | `true`: a real crossroads, moves to the candidate sections whatever its p. `false`: not one, rejected. Also the label for piloting the crossroads question itself |

Never set `fallback.accepted`, an override or `crossroads` yourself: ask the user.

# Pilot

Only for a record in "Ranked". Write `samples.jsonl`, one `{"input", "logged"}` line per real pick; for transcript-backed routing, take them from `picks.jsonl`. Then:

```sh
bun "$toolbox/src/crossroads/survey.ts" pilot <run-dir> <id> samples.jsonl
```

- It takes 30 samples, at least 3 per label where the data allows.
- Disagreements land in `pilot-<id>-disagreements.jsonl`. Ask the user to add a `human` label to each, merge them into `samples.jsonl`, and rerun.
- Pass: agreement ≥ 90% and fallback rate ≤ 20%. A fallback on a sample with no `logged` pick or `fallbackAnswer` leaves `agreement` null (unmeasured) and the pilot cannot pass; `maxAgreement` is the bound if every such fallback were right, `answeredAgreement` covers only the cases the model answered.

# Benchmark

Only after a pilot pass. Write `cases.jsonl` with the 30 pilot samples (`"split": "pilot"`) and 70 fresh cases (`"split": "holdout"`). Every holdout `reference` is labelled blind, without seeing either decider's answer: by the user (`"referenceSource": "blind human"`), or, when the user asks, by two agents from different model families given only the label definitions (`"referenceSource": "blind agent"`). Where the two families split, the user labels the case if the model also falls back; otherwise replace the case. The current decider must not be one of those agents; `score` names the holdout reference sources. Then:

```sh
bun "$toolbox/src/crossroads/survey.ts" bench <run-dir> <id> cases.jsonl
```

- Set `currentDecider.command` in `bench/<id>/contract.json`: it reads `{"id", "input"}` as JSON on stdin and prints `{"label", "usd"}`. It never sees the reference.
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
- The `crossroads` verdict ranks blind-labelled units only moderately: AUC about 0.74 on prompt text and 0.62 on code, from 37 units. Read it as an ordering for review, not as a cut-off.
- Prompt units show the classifier their heading and their own text. Do not widen that to the whole section: units next to a decision then score as decisions, and held-out AUC drops.
- Measure an extraction or wording change on units labelled blind, before their verdicts are seen. Relabelling units the verdict disagrees with fits the labels to the classifier and inflates AUC.
