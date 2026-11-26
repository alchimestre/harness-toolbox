# scheduler bench

Measures a policy for `src/subagent-scheduler.pl`: runs per minute under load, and whether the machine stayed responsive. A policy is a file of `NAME = value` lines for the constants listed in `TUNABLE` in `run.py`.

```sh
python3 bench/scheduler/run.py seed > policy.md
python3 bench/scheduler/run.py policy.md out-dir solo
```

| case | split | load |
|---|---|---|
| solo | dev gate | 1 owner, 16 code-rule runs in flight, 200 runs |
| trio | dev | 3 owners, 16 code-rule runs in flight each, 120 runs each |
| late | final | 3 owners joining 40 s apart, 16 code-rule runs in flight each, 100 runs each |
| small-duo | final | 2 owners, 16 `bench/small` runs in flight each, 96 runs each |
| smoke | none | 2 owners, 4 in flight, 6 runs each: checks the harness |

- Run one case at a time on an otherwise idle machine; a case is the machine's only load.
- A summary lists `breaches`: spawn probe p95 over 40 ms, memory pressure above level 1, any swapout, or an invalid run.
- Final cases are run once, after the last dev round.
