# search-guard

Prevents `web_search` hangs under parallel research load: a session-wide search
budget (enforced), a no-retry policy (enforced + skill), and read-fallback
guidance. Validated 2026-08-04 — sustained volume trips IP-wide bot walls on
the credential-free search engines, and the wall does not reset per session.

## Layout

```
extensions/search-guard.ts   omp extension: budget cap + no-retry rewrite + policy injection
skills/search-hang/SKILL.md  skill: behavioral rules for research agents
src/guard-core.ts            pure logic, no dependencies
test/simulate.ts             scenario harness — `node test/simulate.ts`
docs/runbook.md              incident runbook + validation evidence
```

## Install (minimal conflict)

Nothing is copied into `~/.agents` — Matt Pocock's installer owns that tree.
Wire the repo directly from config instead:

```yaml
# ~/.omp/agent/config.yml
extensions:
  - ~/projects/search-guard/extensions/search-guard.ts
skills:
  customDirectories:
    - ~/projects/search-guard/skills
```

Then restart omp. The extension blocks `web_search` past the budget (default
15, shared session-wide), rewrites provider-failure results to forbid retries,
and injects the policy at every agent start; the `search-hang` skill carries
the rules to task subagents.

## Related config

`providers.webSearchTimeoutSeconds 30` is the tuned per-provider ceiling
(default 60): it bounds transport stalls while leaving the browser-backed
engines room (measured first-call latencies: Google 21.7s, Mojeek 27.5s).

## Test

`node test/simulate.ts` (Node >= 23.6, erasable TS) drives the guard through
the incident scenario and prints state after each step.
