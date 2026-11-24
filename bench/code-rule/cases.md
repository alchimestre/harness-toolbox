# Cases

Dev cases are the training and gate pool. Final cases are a held-out family set, run once at the end.

| case | fixture | wording | split |
|---|---|---|---|
| pricing | pricing | pointed | train |
| pricing-urgent | pricing | urgent | dev-gate |
| parser | parser | pointed | train |
| parser-terse | parser | terse | dev-gate |
| refactor | refactor | pointed | dev-gate |
| refactor-urgent | refactor | urgent | train |
| config | config | pointed | dev-gate |
| config-terse | config | terse | train |
| vendor | vendor | pointed | dev-gate |
| vendor-urgent | vendor | urgent | train |
| ledger | ledger | pointed | final |
| ledger-terse | ledger | terse | final |
| cliargs | cliargs | pointed | final |
| cliargs-urgent | cliargs | urgent | final |

- train: SkillOpt training and hand-written candidate design. Failure clusters from train cases only.
- dev-gate: one per fixture family. Dev-gate scores decide whether a candidate is worthy. Never used for design.
- final: never run before the final check. Ledger and cliargs families are unseen by every dev case.
