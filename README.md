# search-guard

Prevents `web_search` hangs under parallel research load: session-wide search
budget, no-retry policy, read-fallback.

## Files

- `skills/search-hang/SKILL.md` — skill for research agents (modified from Matt Pocock's `research` skill)
- `extensions/search-guard.ts` — event extension: budget cap, no-retry rewrite, policy injection (omp reference implementation)
- `src/guard-core.ts` — pure logic, no deps
- `test/simulate.ts` — scenario harness (`node test/simulate.ts`)
- `docs/runbook.md` — incident notes and evidence

## Install

Point your harness at the repo; nothing goes into `~/.agents`.

- **Skill:** add `<repo>/skills` to your harness's custom skills directories, or symlink `skills/search-hang` into `~/.agents/skills/`.
- **Extension:** load `<repo>/extensions/search-guard.ts` through your harness's extension loader.
- **Search timeout:** a ~30s per-provider ceiling is recommended where configurable.

## Behavior

- Blocks `web_search` past the budget (default 15, session-wide).
- Rewrites provider-failure results to forbid retries.
- Injects the rules at agent start, so subagents get them without reading the skill.
