# Cases

Fixture families: `a` (JS CLI), `b` (Python CLI), `c` (JS ESM library), `d` (Python package), `e` (JS CLI, clean final), `f` (Python package, clean final). Wording variants: `terse`, `pointed`, `urgent`, `casual`.

| Case | Fixture | Wording | Split |
|---|---|---|---|
| a-terse | a | terse | dev, dev gate |
| a-pointed | a | pointed | dev, dev gate |
| a-urgent | a | urgent | dev, dev gate |
| a-casual | a | casual | dev, dev gate |
| b-terse | b | terse | dev, train |
| b-pointed | b | pointed | dev, train |
| b-urgent | b | urgent | dev, train |
| b-casual | b | casual | dev, train |
| c-terse | c | terse | final |
| c-pointed | c | pointed | final |
| c-urgent | c | urgent | final |
| d-terse | d | terse | final |
| d-pointed | d | pointed | final |
| d-urgent | d | urgent | final |
| e-terse | e | terse | clean final |
| e-pointed | e | pointed | clean final |
| f-terse | f | terse | clean final |
| f-pointed | f | pointed | clean final |

- Dev (8 cases): rounds and reporting. Dev gate = `a-*`: rounds select on it, and SkillOpt val uses it. Train = `b-*`: SkillOpt trains on it, and candidates are designed from its failures only.
- Contaminated final (6 cases, families `c` and `d`): seed sanity ran on them, so they are reported separately and are not a clean gate.
- Clean final (4 cases, families `e` and `f`, terse and pointed): new, never run before the final check, never used to design a candidate.
- SkillOpt test split: none.
