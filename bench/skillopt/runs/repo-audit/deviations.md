# Protocol deviations

1. Seed sanity leak: `seedcheck` ran the seed on all 16 cases, including families `c` and `d`. `cases.md:23` says the final cases never run before the final check. No selection used those runs, but the held-out data is no longer untouched.
2. Candidate source: `cases.md:22` says candidates are designed from `b-*` failures only. `hand3` (round 2) was designed from `a-*` (dev gate) failures, specifically the `dispatch-formatters` decoy. Its rejection leaves the incumbent unchanged. The iteration does not follow the split.
3. Unverified: the origin of `hand1` and `hand2` (round 1) is not recorded. Check whether they were designed from `a-*` or `b-*` failures.
