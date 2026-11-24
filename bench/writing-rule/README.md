# writing-rule bench

Measures whether `rules/writing.md`, appended to the system prompt, makes the agent obey its limits when the prompt asks for the opposite.
Cases and splits (`train-dev`, `dev-gate`, `final`): see `cases.md`. Final cases run only through `arms.py --final`.
Run: `AGENT_PROMPT=/abs/path/rule.md ./run.sh <case> <provider/model:level> <rep>`; files land in `runs/` (`.result`, `.parts`, `.fails`, `.out`).
Checks are mechanical: `check.py <family> <dir> [case]`; the last stdout line is `passed/total`, failing checks go to stderr as `fail: <name>`.
`PROMPT_ONLY=1` prints the assignment without running.
