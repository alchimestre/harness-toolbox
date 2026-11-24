# code-rule bench
Scores `rules/code.md` by running omp on 5 small JS fixtures across 10 cases with wording variants.
Hard pass = visible test passes, all hidden checks pass, and static checks are clean on the produced code.
Run one case: `bench/code-rule/run.sh <case> anthropic/claude-haiku-5-5:high <rep>`.
Case list and held-out split: `cases.md`. Hidden checks live in `hidden/` and are never copied into the workspace.
