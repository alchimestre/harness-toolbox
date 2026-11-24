---
name: flame-graph
description: "Use when asked for a flame graph (SVG) of a running process, a harness session or one agent in it, or any hierarchy with a number per leaf (file sizes, test times, churn). For a session it can also write a timeline of its model and tool calls."
---

You turn a subject into folded stacks and render them with `flamegraph.pl`. You measure and draw; you do not fix what the graph shows.

# Inputs

- **Subject**: a pid or process name, a session transcript or session id, an agent name within a session, or a directory or dataset. Not found: report `BLOCKED: <what is missing>` and stop.
- **Measure**: what a frame's width counts. Missing: samples for a process, `ms` for a session or agent, bytes for a directory.
- **Duration**, for a process. Missing: 10 seconds.
- **Output**: a directory. Missing: a new one from `mktemp -d`.

# Folded stacks

Every subject becomes lines of `root;child;leaf <count>`.

- Frames run root first, joined by `;`. A frame holds no `;` and no newline.
- The count is a whole number. Scale a fractional unit until it is one: dollars become micro-dollars.
- The count is the stack's own weight. Never write a subtotal for a parent: `flamegraph.pl` adds the children up, so `du` directory totals or a test suite's total time would count twice.

# Collectors

| Subject | Command |
|---|---|
| Native process | `sample <pid> <seconds> -file <absolute path>.sample.txt`, then `stackcollapse-sample.awk <file> > <name>.folded` |
| Python process | `py-spy record --format raw --duration <seconds> --pid <pid> --output <name>.folded` |
| Session or agent | `bun "$toolbox/src/session-flame.ts" <transcript.jsonl> <ms\|tokens\|microusd> > <name>.folded` |
| Anything else | Build the lines from the hierarchy and one number per leaf |

- `sample` writes nothing when `-file` is a relative path.
- `sample` shows a Python process as interpreter frames. `py-spy` shows Python functions and needs root on macOS.
- `$toolbox` is the checkout this skill lives in: `toolbox=$(dirname "$(dirname "$(dirname "$(realpath skill://flame-graph/SKILL.md)")")")`.
- File sizes, as the model for "anything else": `find <dir> -type f -exec stat -f '%z %N' {} + | awk '{size=$1; sub(/^[0-9]+ /, ""); gsub(/;/, ","); gsub("/", ";"); print $0, size}'`. On Linux the `stat` format is `-c '%s %n'`.

# Sessions and agents

- A session transcript is `~/.omp/agent/sessions/<project>/<start>_<id>.jsonl`. Its subagents are `<start>_<id>/<Name>.jsonl`, and theirs `<start>_<id>/<Name>/<Name>.<Child>.jsonl`.
- The script folds the transcript it is given and every subagent below it. For one agent, pass that agent's file.
- `ms` frames: session title, `agent:<Name>` per subagent level, then `model:<id>` split into `first token` and `generation`, or `tool:<name>` and the call's intent.
- `tokens` and `microusd` frames end in `model:<id>` and `input`, `output`, `cacheRead` or `cacheWrite`. Tool calls carry neither.
- `ms` adds up each agent's model and tool time. Parallel tool calls and subagents each count in full, so the total can exceed the wall clock. A parent waiting on a subagent counts as its own `tool:` time beside the subagent's work. Time waiting for the user is not counted.
- Model time is recorded. Tool time is recorded only where the transcript has a run time (`bash`); every other tool is estimated from the end of the model call that issued it to the tool's result, which includes time queued behind other calls of the batch. Name the estimated tools in the report.
- Timeline, only when the request asks what happened when: `bun "$toolbox/src/session-flame.ts" <transcript.jsonl> trace > <name>.trace.json`. It is trace-event JSON for `ui.perfetto.dev` or `speedscope.app`: one process per agent, overlapping calls on separate rows. Each event's `interval` argument is `measured` or `dispatch to result`.

# Render

```sh
flamegraph.pl --title "<subject>: <measure>" --countname <unit> <name>.folded > <name>.svg
```

1. Check the folded file has lines before rendering. Empty: report the collector's output and write no SVG.
2. Keep `--countname` ASCII, `microUSD` for cost: `flamegraph.pl` double-encodes other characters.
3. Keep the `.folded` file beside the SVG.
4. `flamegraph.pl` 1.0 has no `--flamechart`. Order in time belongs to the timeline.

# Rules

- Never `sudo`. A collector that needs root, or a process owned by another user: stop and report the exact command to run.
- Do not start, stop or signal the subject process unless the request says to launch it.
- `flamegraph.pl` or `bun` missing: report `BLOCKED: <tool> not installed` and stop.
- Write only inside the output directory.

# Report

- Paths of the SVG, the folded file and the timeline, and the command that opens the SVG in a browser (`open -a Safari <name>.svg` on macOS). The file type's default application may not be one.
- The collector command as run.
- Total count and unit, then the five widest stacks with their share: `awk '{print $NF, $0}' <name>.folded | sort -rn | head -5`.
- What the measure counts twice or leaves out for this subject.
