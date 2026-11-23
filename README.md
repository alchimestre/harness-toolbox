# harness-toolbox

Extensions, rules, and skills for the `omp` coding harness. Each tool is independent; load only what you need.

## Tools

| Tool | Kind | File | What it does |
|---|---|---|---|
| search-guard | extension | `extensions/search-guard.ts` | Caps `web_search` at 15 calls, rewrites provider errors to forbid retries, injects the policy at agent start. Logic in `src/guard-core.ts`. |
| advisor-cross-family | extension | `extensions/advisor-cross-family.ts` | Moves the advisor role to another model family when the session's live model changes provider. Checks the configured role, not the model a fallback chain lands on. |
| search-hang | skill | `skills/search-hang/SKILL.md` | The anti-hang policy for agents that read skills. |
| ponytail-compatibility | skill | `skills/ponytail-compatibility/SKILL.md` | Makes applicable workflows and agent roles take precedence over conflicting Ponytail instructions of equal authority. |
| code | rule | `rules/code.md` | Personal comment, readability, dependency, and repository portability constraints. |
| writing | rule | `rules/writing.md` | Reader-facing document formats and ticket limits. |
| readonly-reviewer | agent | `agents/readonly-reviewer.md` | Read-only change review: spec and standards axes kept separate, then correctness, security, performance, tests. Needs the diff passed in. |
| review-high, review-low | agent | `agents/review-high.md`, `agents/review-low.md` | `readonly-reviewer` at high and low thinking. Bodies must stay identical to `readonly-reviewer`. |
| review bench | bench | `bench/review/` | Runs `readonly-reviewer` on diffs with planted bugs; scores recall, cost, time per model and effort. |
| small-role bench | bench | `bench/small/` | Scores a tool-call fix, a commit subject, the bundled scout prompt, a multi-file spec fix with a decoy file, and an exploration fix (bug copies reachable only by search, a frozen decoy, a lookalike that must stay) per model and effort. |

## Install

1. Add the extensions and skill directory to `~/.omp/agent/config.yml`:

```yaml
extensions:
  - /path/to/harness-toolbox/extensions/search-guard.ts
  - /path/to/harness-toolbox/extensions/advisor-cross-family.ts
skills:
  customDirectories:
    - /path/to/harness-toolbox/skills
```

2. Link the rules and the compatibility skill as startup rules:

```sh
ln -s /path/to/harness-toolbox/skills/ponytail-compatibility/SKILL.md ~/.omp/agent/rules/ponytail-compatibility.md
ln -s /path/to/harness-toolbox/rules/code.md ~/.omp/agent/rules/code.md
ln -s /path/to/harness-toolbox/rules/writing.md ~/.omp/agent/rules/writing.md
```

3. Link the agents into the user agent directory:

```sh
for agent in readonly-reviewer review-high review-low; do
  ln -s /path/to/harness-toolbox/agents/$agent.md ~/.omp/agent/agents/$agent.md
done
```

4. Restart the harness.

Set `providers.webSearchTimeoutSeconds: 30`. Under parallel load the search provider chain grinds for a minute per failed call.

## Behavior

- **search-guard** counts calls process-wide, so parallel subagents share one budget. The 16th call is blocked with a read-the-URLs reason. A result starting `Error:` gets a no-retry suffix appended.
- **advisor-cross-family** runs at session start and on `retry_fallback_applied`, comparing the live model's family with the configured advisor's and overriding `modelRoles.advisor` to the first preference of another family. Subagent sessions are skipped. Limits: it reads the configured role, so a review that a fallback chain lands in the primary's family goes unfixed; keep primary-family models out of the advisor's chain by hand. The anthropic preference is `claude-sonnet-5-5` because Opus's chain returns to `gpt-6.2-sol`, which is the primary family in the case that entry serves. The openai-primary path has not been exercised end to end.

## Tests

```sh
bun run test
```

`test/simulate.ts` drives the guard through the load scenario. `test/wiring.ts` checks each extension against a fake harness API.

## Bench

Runs use `omp -p` with retries, model fallback, and the advisor off (`bench/overlay.yml`). They spend subscription quota. Each run takes 10–40 s.

```sh
bench/review/run.sh <easy|hard|subtle> anthropic/claude-haiku-5-5:low <rep>
bench/small/run.sh <tools|commit|scout|task|explore> anthropic/claude-haiku-5-5:low <rep>
python3 bench/review/score.py
python3 bench/small/score.py
```

Each scorer fails when a run was answered by a model other than the one requested.
