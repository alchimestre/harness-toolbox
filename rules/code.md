---
alwaysApply: true
description: Code clarity and public-by-default defaults for code, tests, config, and fixtures. Load for any new or modified code or configuration.
---

# Code

Scope: new and modified code and configuration. Configuration = every file an agent edits: YAML, JSON, TOML, INI, `.env`, Dockerfiles, CI workflows, IaC (Terraform, Ansible, Kubernetes), nginx, shell, dotfiles. Unrelated cleanup stays outside the change.

## Comments

Prefer self-explaining code. A comment is allowed only for a real footgun: looks correct, is not, next reader would break it. Say what breaks, one line.

Never: explain what the code says, restate a ticket, narrate a decision (decisions go in the register), add section banners, leave commented-out settings or history, write a paragraph above a block.

Config bar is higher: comment only where the file alone would mislead — a value kept in sync elsewhere, a required workaround, non-obvious ordering. A key whose name says what it is gets nothing.

Alert `description` annotations: one sentence. They are read while something is on fire.

Keep required legal notices and public API documentation.

## Readability

- Every function fits on one screen, about 40 lines. Longer means split, not scroll.
- Nesting stops at three levels. Flatten with an early return or an extracted function.
- One statement per line. No chained calls spanning lines to save a variable.
- Name every value that needs a thought: no magic numbers, no `tmp`, no `d`, no `x2`.
- A name says what the thing is, not how it is made: `harmonic_distance`, not `calc_hd`.
- Code reads top to bottom. A helper sits below the code that uses it.

## Dependencies

Take a library as a package, pinned in the manifest. Never vendor a copy into the tree.

Do not read a dependency's source into the session to learn its API. Use its README, its public examples, and compiler errors. When one signature is genuinely undocumented, read that signature and nothing else. If a dependency cannot be consumed as a package, say so before writing an adapter against it.

## Terminology

One term per concept, across code, tests, documentation. Follow the project vocabulary; keep distinct concepts distinct. Preserve external API names at their boundaries.

## Public by default

Every repo file is read by people who never saw this machine. Relative paths, standard locations, nothing pointing at a local setup.

- NEVER `/Users/<name>/...`, `~`, a home directory, a machine-specific mount.
- Name no person: no name, handle, email, "the developer", "the owner", "his".
- No local vocabulary: private harnesses, agent glue, internal note systems, planning workflows, ticket numbers, `.scratch/` paths.
- State the reason; do not point at a ticket or internal document.
- Machine-specific config: untracked file, committed `*.example` beside it.
- Generic default; the local value comes from config or an environment variable.
- Keep an app's own install paths and the platform's standard names.
