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
4. Draft the question for every record under "Not pilot-ready": read the code or prompt at each `Where`, then set `question.instructions`, a one-line criterion per label and `question.input` on the record's line in `candidates.jsonl`. Set `question.reference` only when transcripts or logs hold the right answer; never invent one. Leave the question empty when the text holds no single closed pick, and list those records with the reason. Rerun `report`.

Output stays in `<target>/.scratch/crossroads/`. The survey adds `.scratch/` to the target's `.git/info/exclude` when git doesn't already ignore it; it never edits `.gitignore`.

# Report sections

| Section | Holds |
|---|---|
| Changed since last run | New, gone and moved record ids |
| Ranked | Candidates (crossroads p ≥ 0.7) with a complete decision contract, no failed gate |
| Not pilot-ready | Candidates missing part of their contract |
| Review band | Crossroads p 0.3–0.7: a human decides |
| Rejected appendix | Any gate failed |

Rank order: all gates pass, then class (LLM closed choice, prompt instruction, harness branch, rule pretending to judge), then transcript occurrences, then line churn (commits that changed the matched code), then crossroads probability.

An LLM call with an enum schema (`z.enum`, `Literal[...]`, JSON `enum`) gets its `question.labels` from the schema; add each label's criterion by hand.

# Human edits

Edit the record's line in `candidates.jsonl`, then run `bun "$toolbox/src/crossroads/survey.ts" report <run-dir>`. Edits carry forward to later runs by `id`.

| Field | Edit |
|---|---|
| `fallback.accepted` | `true` by default; `false` once a human rejects the proposed fallback |
| `question` | `instructions`, `labels` (label → one-line criterion), `input` (what the model sees), `reference` (where the right answer comes from) |
| `overrides` | `{"<gate>": "pass"}` or `"fail"` where the classifier is wrong |
| `crossroads` | `true`: a real crossroads, moves to the candidate sections whatever its p. `false`: not one, rejected. Also the label for piloting the crossroads question itself |

Never set an override, `crossroads` or `fallback.accepted: false` yourself: ask the user.

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

## Current decider

The current decider is the real cost that a confident answer replaces, run the way the harness really runs it. Choose the case that fits the candidate:

- The answer lets the harness skip a whole agent turn or tool call. The current decider is that turn or call, run end to end in a temp state built from `input`. Its label is read from the effect it leaves (a file, a commit, a repo state), never from the agent's own report. The candidate names the action that executes a confident answer, set as `action.command`. The model track is Jev plus that action.
- A standalone LLM call or code rule. The current decider is that call or rule, run as written.
- The decision sits inside a turn that runs anyway. Replacing it saves nothing. Report the candidate as rejected and do not bench it.

## Contract

Set these in `bench/<id>/contract.json` before running the matrix:

- `currentDecider.command` (required): reads `{"id", "input"}` as JSON on stdin and prints `{"label", "usd"}`. It never sees the reference.
- `action.command` (skip-turn candidates): reads `{"id", "input", "label"}` and runs only after a confident model answer. It prints `{"label", "usd"}`, where `label` is read from the state the action left, the same way as the current decider's; that label is scored. Its time and usd add to the model's.
- `fallbackDecider.command` (optional): answers the model's fallbacks instead of the current decider. Leave it unset: a fallback normally runs the real current path.
- `latency`: `"relative"` when the current decider is a full turn; then delete `budgetMs`, since a contract with both is rejected. The p95 bar becomes the current decider's p95 from the same run.

- Hand `bench/<id>/` to the `bench-runner` agent: matrix `model` and `current` × every case × reps 1–5, one `run <decider> <case-id> <rep>` per cell, its JSON line appended to a results file, scored by `score <results.jsonl>`. `score` rejects a missing, duplicate or unknown cell and its `latencyBar` field names the latency bar that applied.

| Pass bar (holdout only) | Current decider is an LLM | Current decider is code |
|---|---|---|
| Accuracy | ≤ 2 points below | ≥ 10 points above |
| Cost per decision | ≥ 10x lower | not applied |
| p95 latency | ≤ 2 s, or ≤ current p95 if `latency` is `"relative"` | ≤ 2 s, or ≤ current p95 if `latency` is `"relative"` |
| Fallback rate | ≤ 20% | ≤ 20% |

# Limits

- Never replace security or permission checks, offline or no-key paths, hot loops, or audit-reproducible decisions.
- "Reads prompt text" in code is guessed from identifier names, not traced.
- Transcript picks use today's routing catalog, not the one live at each pick.
- Code extraction covers Python and TypeScript only.
- Schema labels and the branch-on-answer test read the enclosing function only: a module-level schema or an answer passed to another function is missed.
- Line churn is unknown for a file with uncommitted edits: commit before surveying.
- The `state sufficient` and `egress` gates are classifier guesses from the code or prompt, not from real inputs: check egress yourself before a pilot sends data.
- The `crossroads` verdict ranks blind-labelled units only moderately: AUC about 0.74 on prompt text and 0.62 on code, from 37 units. Read it as an ordering for review, not as a cut-off.
- Prompt units show the classifier their heading and their own text. Do not widen that to the whole section: units next to a decision then score as decisions, and held-out AUC drops.
- Measure an extraction or wording change on units labelled blind, before their verdicts are seen. Relabelling units the verdict disagrees with fits the labels to the classifier and inflates AUC.
