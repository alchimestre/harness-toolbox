# Cases

Each case copies its fact sheet to `facts.md` in a sandbox (`facts/<case>.md`, else `facts/<family>.md`); the agent has `read` and `write` only and writes the artifact to a named file.
`facts/*.md` mix the content with history, tracker IDs, reassurance and tracker state. Prompts marked "pointed", "urgent" or "terse" ask for what
the rule forbids (background, Context/Notes sections, ticket references, tracker fields, history, long output). The rule and the prompt conflict
on purpose: the rule wins, so a run passes only when it obeys the rule's limits.
Hard pass = every check in `check.py` passes; soft = fraction of checks passed.

Splits: `train-dev` (8) is where candidate failures are read; `dev-gate` (4) decides between candidates and is never used to design one;
`final` (3, new fact sheets on new subjects) runs once, with `arms.py --final`, after the incumbent is chosen.

| case | artifact | wording | split |
|---|---|---|---|
| ticket | ticket from a bug report full of history | plain | train-dev |
| ticket-pointed | same | asks for full background, a Context section, tracker IDs | train-dev |
| ticket-urgent | same | asks for Type/Status/Assignee, Background and Notes sections, long acceptance list | train-dev |
| ticket-terse | same | five-word request | dev-gate |
| readme | README for a small CLI | plain | train-dev |
| readme-pointed | same | asks for Background, prose Features, a ticket ID, reassurance | dev-gate |
| runbook | runbook for a database alert | plain | train-dev |
| runbook-urgent | same | asks for rationale per step, reassurance, incident history with numbers | dev-gate |
| resolution | resolution comment for a decided thread | plain | train-dev |
| resolution-pointed | same | asks for full timeline, positions, ticket ID | dev-gate |
| map | map index line for a ticket | plain | train-dev |
| map-pointed | same | asks for ticket reference, status, background in the line | train-dev |
| ticket-f1 | ticket from a bug report, new subject (CSV import with a byte order mark) | asks for background, a Background section, the tracker ID | final |
| resolution-f1 | resolution comment, new subject (price cache TTL) | asks for full timeline, positions, the ticket ID | final |
| readme-f1 | README for a small CLI, new subject (CSV dedupe) | asks for Background, prose Features, history, reassurance | final |

Checks per artifact: ticket (title verb-first from a verb list, title <= 8 words, body <= 60, <= 5 acceptance items of <= 10 words, no
Context/Background/Notes/Why sections, no Type/Status/Assignee lines, no ticket IDs, no history phrasing); README (<= 2-sentence intro, no
prose paragraph over 20 words, a table, a code block, no forbidden sections, no IDs, no history, no rationale or reassurance); runbook
(numbered steps, same prose/section/ID/history/rationale checks); resolution comment (<= 150 words, states the reason, no IDs, no history or
discussion narrative); map line (one line, <= 20 words, no status, no IDs, no history). Every artifact must be written and mention the fact
sheet's core subject.
