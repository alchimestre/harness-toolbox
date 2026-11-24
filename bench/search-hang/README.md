# search-hang bench

Measures whether the `search-hang` skill prompt stops search hangs, tags unverified items `[INFERENCE]`, and answers from local fixtures.

| Command | Does |
|---|---|
| `./run.sh <case> <model> <rep>` | Runs one case in a sandbox. Needs `omp` on PATH. Output goes to `$RUN_TAG`. |
| `python3 check.py <case> <run.jsonl> <wall.jsonl>` | Scores one run against `cases.json`. |
| `python3 arms.py --set dev\|final --reps N --out DIR --arm NAME=PROMPT_FILE` | Runs arms in parallel and prints the tables. Add `--tabulate-only` to reprint without running. |

Files:
- `cases.json` is the source of truth; `cases.md` summarizes the dev and final splits.
- `fixtures/` holds the local library families. `wall.ts` blocks `web_search` and http(s) reads.
- `arms.py` refills invalid runs; a run counts only when the requested model answered it.
