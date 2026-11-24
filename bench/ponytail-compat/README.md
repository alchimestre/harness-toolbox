Measures whether a system-prompt rule keeps the Ponytail "lazy minimal diff" persona from overriding a conflicting workflow instruction.
Each run gets the fixed block in `ponytail.md` plus an optional candidate, and is scored mechanically from the event log, output and files by `check.js`.
Run: `bench/ponytail-compat/run.sh <case> <provider/model:level> <rep>`; `AGENT_PROMPT=<file>` appends a candidate, `PROMPT_ONLY=1` prints the user prompt.
Dev set: 20 cases over tdd, json, reuse, approve, module, bug and dedupe. Final set: counter and headers, 4 cases. Split and gate in `cases.md`.
Prompts live in `cases/<case>.txt`, fixtures in `fixtures/<name>`; `check.js` prints `passed/total` last and `fail: <name>` on stderr.
