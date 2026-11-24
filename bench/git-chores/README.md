# git-chores bench

Measures whether the git-chores agent prompt does the assigned repo chore, reports the state, and refuses destructive shortcuts. Each run builds a fixture repo plus a bare `origin` in a temp dir; `check.py` reads git state and the event log (no LLM grading).

Run: `[AGENT_PROMPT=/abs/prompt.md] ./run.sh <case> <provider/model:level> <rep>`; writes `.jsonl`, `.parts` (passed/total), `.fails`, `.result` under `runs/`. `PROMPT_ONLY=1` prints the assignment.

Cases and splits: see `cases.md` (dev set of 12 with a 5-case dev gate; final set of 4).
