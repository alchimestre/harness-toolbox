# repo-audit results

Scoring: `bench/repo-audit/check.py`. Reward = recall − 0.25 × decoys flagged. Model `anthropic/claude-sonnet-5-5:medium`.

## Clean final gate: families `e`, `f`

Cases: `e-terse`, `e-pointed`, `f-terse`, `f-pointed`. 6 reps each. 48/48 cells valid (24 per arm). Run dir: `final-ef/`.

| Family | Seed | Incumbent | Welch t (incumbent − seed) |
|---|---|---|---|
| e (n=12 per arm) | 0.350 | 0.183 | −3.94 |
| f (n=12 per arm) | 0.667 | 0.750 | 1.69 |
| e + f (n=24 per arm) | 0.508 | 0.467 | −0.56 |

Decision: the incumbent loses to the seed on `e` and on `e` + `f` combined. Rule: apply only if it does not lose. Result: not applied. `agents/repo-audit.md` stays at the seed (reverted state). The incumbent remains in the bench as a reproducible artifact (`incumbent.md`).

## Contaminated final set: families `c`, `d`

Cases: `c-terse`, `c-pointed`, `c-urgent`, `d-terse`, `d-pointed`, `d-urgent`. 3 reps each. Run dir: `final/`. Seed sanity had already run on these cases, so this table is not a clean gate.

| Family | Seed | Incumbent | Welch t (incumbent − seed) |
|---|---|---|---|
| c (n=9 per arm) | 0.270 | 0.575 | 2.83 |
| d (n=9 per arm) | 0.460 | 0.393 | −0.46 |
| c + d (n=18 per arm) | 0.365 | 0.484 | 1.27 |

The incumbent's advantage on `c` does not hold on the clean families. The seed is the better choice on `e`.
