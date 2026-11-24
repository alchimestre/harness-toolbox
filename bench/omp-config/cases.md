# Cases

Prompts and expectations live in `check.ts`; `bun check.ts ids dev|gate|final` lists each set.

| case | fixture family | set |
|---|---|---|
| role-tracked | a | dev |
| role-tracked-terse | a | dev |
| role-tracked-urgent | a | dev, dev-gate |
| role-untracked | a | dev, dev-gate |
| override-add | a | dev |
| scalar-untracked | a | dev |
| scalar-tracked | a | dev |
| shadowed | a | dev, dev-gate |
| selector-unresolved | a | dev, dev-gate |
| chain-loop | a | dev |
| final-b-role | b | final |
| final-b-scalar-untracked | b | final |
| final-c-shadowed | c | final |
| final-c-unresolved | c | final |

- Dev: 10 cases, used for seed sanity and candidate rounds.
- Dev gate: 4 cases, the subset that decides "worthy" candidates. SkillOpt validation uses the same subset.
- Final: 4 cases across families b and c, which no dev case uses. Never run before the final check.
