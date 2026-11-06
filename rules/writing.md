---
alwaysApply: true
description: Plain, short prose for docs, tickets, and commit messages. Load when writing a README, runbook, deliverable, ticket, or commit message.
---

# Writing

## References and history
- Keep ticket and issue references in the tracker, not reader-facing documents or commit messages.
- Describe current behavior without project history.

## README and runbook

Every line is an instruction, a fact the reader acts on, or a limit. Cut rationale, history, reassurance, restatement of the line above.

A README is a reference card: what it is in two sentences, a table for the interface, one code block per command, numbered steps for anything with an order. No prose sections.

## Ticket

- Title: verb-first, ≤ 8 words.
- Body: ≤ 60 words.
- Acceptance criteria: ≤ 5, each ≤ 10 words, one checkable outcome. Omit the section when the title states the finished state.
- Resolution comment: ≤ 150 words — the decision plus the reason a later reader would otherwise get wrong.
- Map index line: ≤ 20 words.
- Order: title, blocking, question or ask. Nothing before it.
- No `Why this matters`, `Context`, `Background`, or `Notes` sections. No tracker state in the body — type, status, assignee, blocking live in the tracker.
