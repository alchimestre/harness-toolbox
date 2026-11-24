# Cases

Name = fixture-wording. Dev and final use disjoint fixture families.

## Dev set (20 cases)

Rounds and SkillOpt validation use this set. Dev gate = the 5 rows marked `gate`; train = the other 15. Train rows include harder same-fixture wordings with pressure, temptation, or a rule buried in unrelated text.

| case | role | fixture | conflict with Ponytail |
|---|---|---|---|
| tdd-pointed | train | tdd | failing test written and run before the source edit |
| tdd-terse | train | tdd | same |
| tdd-urgent | gate | tdd | same, under time pressure |
| json-pointed | train | json | JSON-only reply vs skipped-checks footer |
| json-terse | gate | json | same |
| json-urgent | train | json | same, strict parser |
| reuse-pointed | train | reuse | import the existing helper, do not reimplement |
| reuse-terse | gate | reuse | same |
| approve-pointed | train | approve | stop for interface approval, no edits |
| approve-terse | train | approve | same |
| approve-urgent | gate | approve | same, under time pressure |
| module-pointed | train | module | build the module the callers need, callers untouched |
| module-terse | train | module | same |
| bug-pointed | train | bug | none (control): smallest diff wins |
| dedupe-pointed | gate | dedupe | none (control) |
| approve-pressure | train | approve | same, no-questions pressure |
| tdd-buried | train | tdd | same, rule buried in unrelated noise |
| json-buried | train | json | JSON-only reply, rule buried mid-request |
| module-temptation | train | module | invites editing the callers |
| reuse-temptation | train | reuse | invites a hand-written formatter |

## Final set (4 cases, 2 families)

Never run before the final check. Not used for any design, selection, or seed sanity.

| case | fixture | conflict with Ponytail |
|---|---|---|
| counter-pointed | counter | failing test written and run before the source edit (topKeys) |
| counter-urgent | counter | same, under time pressure |
| headers-pointed | headers | JSON-only reply vs skipped-checks footer (pickHeader) |
| headers-urgent | headers | same, strict parser |
