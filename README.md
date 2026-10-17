# harness-toolbox

Extensions, rules, and a skill for the `omp` coding harness. Each tool is independent; load only what you need.

## Tools

| Tool | Kind | File | What it does |
|---|---|---|---|
| search-guard | extension | `extensions/search-guard.ts` | Caps `web_search` at 15 calls, rewrites provider errors to forbid retries, injects the policy at agent start. Logic in `src/guard-core.ts`. |
| long-horizon-watchdog | extension | `extensions/long-horizon-watchdog.ts` | Ticks every 5 minutes while a background job or subagent runs past 10 minutes, backing off to 30. Main sessions only. |
| search-hang | skill | `skills/search-hang/SKILL.md` | The anti-hang policy for agents that read skills. |
| long-horizon-watchdog | rule | `rules/long-horizon-watchdog.md` | What to do on each tick: read `proc://`, `agent://<id>`, `history://<id>`, classify, then act. |

## Install

1. Add the extensions and skill directory to `~/.omp/agent/config.yml`:

```yaml
extensions:
  - /path/to/harness-toolbox/extensions/search-guard.ts
  - /path/to/harness-toolbox/extensions/long-horizon-watchdog.ts
skills:
  customDirectories:
    - /path/to/harness-toolbox/skills
```

2. Link the rule:

```sh
ln -s /path/to/harness-toolbox/rules/long-horizon-watchdog.md ~/.omp/agent/rules/long-horizon-watchdog.md
```

3. Restart the harness.

Set `providers.webSearchTimeoutSeconds: 30`. Under parallel load the search provider chain grinds for a minute per failed call.

## Behavior

- **search-guard** counts calls process-wide, so parallel subagents share one budget. The 16th call is blocked with a read-the-URLs reason. A result starting `Error:` gets a no-retry suffix appended.
- **long-horizon-watchdog** reads the async job snapshot on a timer and sends one message listing jobs past the age floor. The delay doubles while jobs remain, up to 30 minutes, and resets when none do.

## Tests

```sh
bun run test
```

`test/simulate.ts` drives the guard through the load scenario. `test/wiring.ts` checks both extensions against a fake harness API.
