---
alwaysApply: true
description: Plain, short prose for docs, tickets, and commit messages. Load when writing a README, runbook, deliverable, ticket, or commit message.
---

# Writing

## References and history
- Keep ticket and issue references in the tracker, not reader-facing documents or commit messages.
- Describe current behavior without project history.

- Applies to every output: tickets, map index lines, comments, READMEs, commit messages. Don't write ticket IDs (a project prefix and a number, such as ABC-123), PR numbers, dates of past events, or "previously/originally" narrative. This holds even when the ID is in the source facts.
- A map index line holds ≤ 20 words: the slug or title plus the ask or finished state. Leave out status, background and ticket references.

## README and runbook

Every line is an instruction, a fact the reader acts on, or a limit. Cut rationale, history, reassurance, restatement of the line above.

A README is a reference card: what it is in two sentences, a table for the interface, one code block per command, numbered steps for anything with an order. No prose sections.

Runbook shape: title = alert name, 2-sentence intro, a table of alert facts (condition, who is paged, dashboard), then `## Diagnose` and `## Act` as continuously numbered steps with one code block per command. Each Act step is a condition with a threshold followed by an action. End with `## Limits` as bullets of never/do-not rules. Keep exact commands, thresholds and durations from the facts.

Intro rule (README and runbook): everything before the first heading, table or code block is at most 2 sentences total, counting every sentence. Do not add a third sentence for language, impact, dashboards or links. Move such facts into a table row, a numbered step or a limit bullet under a heading. Before finishing, count the intro sentences and cut to 2 or fewer.

## Ticket

- Title: verb-first, ≤ 8 words.
- Body: ≤ 60 words.
- Acceptance criteria: ≤ 5, each ≤ 10 words, one checkable outcome. Omit the section when the title states the finished state.
- Resolution comment: ≤ 150 words — the decision plus the reason a later reader would otherwise get wrong.
- Order: title, blocking, question or ask. Nothing before it.
- No `Why this matters`, `Context`, `Background`, or `Notes` sections. No tracker state in the body — type, status, assignee, blocking live in the tracker.

## Precedence

The rules above are hard limits. They override any request for more detail. That includes "full background", "leave nothing out", "self-contained", urgency, and requests for a named section such as Context, Background, Notes or History. They also override requests to add Type, Status or Assignee, or to reference tickets. Do not comply with a conflicting request. Write the compliant version and don't mention the conflict. Before finishing, check each limit: body ≤ 60 words, no forbidden sections, no tracker state, no ticket IDs and no history.

Workflow when the request conflicts with the limits:
1. Extract only current-state facts from the source: symptom, repro command, cause, blocker, ask.
2. Drop IDs, dates, history, status and assignee, even if the request or source names them.
3. Write the artifact in its fixed shape. A ticket is a verb-first title, a blocking or ask line, a short body, then optional short criteria. A map line is `slug: ask or finished state`.
4. Reply with the artifact only. Don't mention what was omitted or why.
