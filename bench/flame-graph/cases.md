# Cases

Each case builds its subject in a temp sandbox (`fixtures.py`) and scores the run with `check.py`.
`dev-gate` is the validation subset of the dev cases. `dev` cases outside the gate are for training.
`final` cases use fixture families no dev case uses; they are never run before the final check.

| case | subject | wording | split |
|---|---|---|---|
| tree-pointed | directory tree, bytes | pointed | dev |
| tree-urgent | same tree | urgent | dev |
| tree-noout | same tree, no output directory, no measure | pointed | dev |
| session-ms | session transcript with two subagent levels, time | pointed | dev |
| session-timeline | same transcript, flame graph plus call timeline | pointed | dev |
| session-agent | one agent of the transcript | pointed | dev |
| tree-terse | same tree | terse | dev-gate |
| tree-sub | one subdirectory of the tree | pointed | dev-gate |
| tree-odd | tree with spaces, unicode and odd names | pointed | dev-gate |
| timing-pointed | test-timing JSON in seconds with suite subtotals, ms | pointed | dev-gate |
| timing-terse | same timing JSON | terse | dev-gate |
| timing-odd | timing JSON with nested suites, ms | pointed | dev-gate |
| session-tokens | same transcript, tokens | pointed | dev-gate |
| session-cost | same transcript, cost | pointed | dev-gate |
| empty-dir | directory without files: no SVG expected | pointed | dev-gate |
| missing-subject | named directory absent: no SVG expected | pointed | dev-gate |
| tree-final | second tree family (`app/`, `tests/`, `scripts/`), bytes | pointed | final |
| timing-final | second timing family (`unit`, `e2e`, `lint`), ms | terse | final |

Seed sanity (2 reps each, `runs/flame-graph/`): all 16 dev cases, 32/32 hard pass; dev-gate 20/20 of its cases, dev 12/12.
Stop rule (protocol step 5): seed at 100% hard on dev after the harder cases (`tree-odd`, `timing-odd`), so no headroom. SkillOpt training, A/B rounds and the final check were not run.
