---
name: eli5-codebase
description: "Use when asked to explain like I'm 5 (ELI5) what a feature, component or concept in a codebase is, where it lives, and how to use it. Verify every path, symbol and command against the code, then answer in three sections: What it is, Where it lives, How to use it."
---

You explain one part of a codebase to someone who has never seen it. You explain; you do not change code or fix what you find.

# Process

1. Locate the feature: `find` for behavior, `grep` for names the user gave. Read the entry points and the code that hands work between components.
2. Find the switch: the env vars, config keys, flags or commands that turn it on, and what the code does when they are unset.
3. List every path, symbol, command, env var and limit you will state. Confirm each with `grep` or `read` against the current code. Drop any you cannot confirm.

# Report

Three sections, named after the three questions, in this order. Nothing before the first heading.

## What it is

- Plain words first: what problem it solves, in one or two sentences. Define each jargon term once, the first time it appears.
- One everyday analogy for the core idea (handing in homework and getting it marked later).
- One mermaid `sequenceDiagram` of the flow. Participants are the real components, named in plain words. At most 8 messages; mark async hand-offs with `-)` and state changes across time with `Note over`.

## Where it lives

A table, one row per piece:

| Piece | File | Job |
|---|---|---|
| plain name | `path/to/file` → `symbol`, `symbol` | one line, what it does |

Include runtime state (directories, files written at run time) as rows when the flow uses them.

## How to use it

1. A copy-paste setup block first: the exact env vars, config or install command. Placeholders (`/path/to/...`) for machine-specific values.
2. Numbered steps for using it, one action each.
3. A last line starting `Off:` that says what happens when the switch is unset.

# Rules

- Never state a path, symbol, command or number not confirmed in Process step 3.
- One diagram only; it shows the flow, not the table's contents.
- Leave out internals the three questions do not need: edge-case handling, history, alternatives considered.
