# Search-hang cases

Source of truth: `cases.json` (prompts, expected and forbidden patterns, reads). This table is a summary.

Split rules:
- Dev (9): tuned against. Gate subset (4) is the SkillOpt validation set. The other 5 are SkillOpt train.
- Final (6): unseen fixture families (`final-incident`, `final-release`). Run once, at the final check only.

## Dev

| id | gate | kind | fixtures |
|---|---|---|---|
| d1-single-pointed | yes | single | dev-vendor |
| d2-single-terse | no | single | dev-vendor |
| d3-single-urgent | no | single | dev-vendor |
| d4-known-url | no | known-url | dev-vendor |
| d5-multi-pointed | yes | multi | dev-spec |
| d6-multi-terse | no | multi | dev-spec |
| d7-known-url-urgent | yes | known-url | dev-spec |
| d8-parallel-plan | no | parallel | dev-spec, dev-vendor |
| d9-walled-web | yes | walled | dev-vendor |

Dev gate subset: d1, d5, d7, d9.
SkillOpt train: d2, d3, d4, d6, d8.

## Final

| id | kind | fixtures |
|---|---|---|
| f1-single-pointed | single | final-incident |
| f2-multi-terse | multi | final-incident |
| f3-known-url-urgent | known-url | final-incident |
| f4-single-terse | single | final-release |
| f5-parallel-plan | parallel | final-release |
| f6-walled-web | walled | final-release |

Final set is unseen by every arm until the final check.
