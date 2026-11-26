# harness-toolbox

Extensions, rules, and skills for the `omp` coding harness. Each tool is independent; load only what you need.

## Tools

| Tool | Kind | File | What it does |
|---|---|---|---|
| search-guard | extension | `extensions/search-guard.ts` | Caps `web_search` at 15 calls, rewrites provider errors to forbid retries, injects the policy at agent start. Logic in `src/guard-core.ts`. |
| advisor-cross-family | extension | `extensions/advisor-cross-family.ts` | Moves the advisor role to another model family when the session's live model changes provider. Checks the configured role, not the model a fallback chain lands on. |
| jev-effort-gate | extension | `extensions/jev-effort-gate.ts` | Moves a `task` subagent's thinking effort one step when the child starts (`task`, eval `agent()` and workpool spawns), from Jev signals on its assignment (stops-at-first-match risk, exact target, urgent) and provider quota. Other agents keep their configured level. Model and fallbacks stay as configured; each decision is logged as a `harness-toolbox.jev-effort-gate` session entry; fails open without `TYPESAFE_API_KEY`. |
| readonly-lsp | extension | `extensions/readonly-lsp.ts` | Limits the `lsp` tool of `readonly-reviewer`, `review-high` and `review-low` to lookup actions; blocks `rename`, `rename_file`, `code_actions` and any action not on its list. Required by those agents. |
| worker-skill-trim | extension | `extensions/worker-skill-trim.ts` | Removes the `<skills>` catalog from subagent system prompts; the main session keeps it, and workers still load a skill by name through `skill://<name>`. |
| subagent-scheduler | extension | `extensions/subagent-scheduler.ts` | Makes every subagent wait for a slot from `src/subagent-scheduler.pl` at its first tool call and hold it until its run ends; a subagent gives its slot back while it calls `task`, `wait` or `eval`. The main session and subagents inside a bench run are not queued. Needs `extensionHandlers.toolCallTimeoutMs` above the longest expected wait. |
| search-hang | skill | `skills/search-hang/SKILL.md` | The anti-hang policy for agents that read skills. |
| ponytail-compatibility | skill | `skills/ponytail-compatibility/SKILL.md` | Makes applicable workflows and agent roles take precedence over conflicting Ponytail instructions of equal authority. |
| omp-config | skill | `skills/omp-config/SKILL.md` | Changes omp settings (roles, overrides, fallback chains, efforts), reads each key back with `omp config get`, mirrors keys an example config already tracks. Never commits. |
| flame-graph | skill | `skills/flame-graph/SKILL.md` | Draws a flame graph SVG of a process (`sample`, `py-spy`), a session or one agent in it (`src/session-flame.ts`: wall time, tokens or cost), or any hierarchy with a number per leaf. For a session it also writes a trace-event timeline. Needs `flamegraph.pl` and `bun`. |
| code | rule | `rules/code.md` | Personal comment, readability, dependency, and repository portability constraints. |
| writing | rule | `rules/writing.md` | Reader-facing document formats and ticket limits. |
| readonly-reviewer | agent | `agents/readonly-reviewer.md` | Read-only change review: spec and standards axes kept separate, then correctness, security, performance, tests. Needs the diff passed in. |
| review-high, review-low | agent | `agents/review-high.md`, `agents/review-low.md` | `readonly-reviewer` at high and low thinking. Bodies must stay identical to `readonly-reviewer`. |
| task | agent | `agents/task.md` | Overrides the bundled `task`: its scope covers every spec violation the assignment names, so it fixes what it notices instead of reporting it. Hard passes vs bundled on `bench/small`, Haiku: low 180/234 vs 166/234, medium 131/162 vs 129/162, high 138/162 vs 132/162. The prompt was chosen on `expiry`, `callers` and `guard`; on the fixtures it never saw (`explore`, `task`, `tools`): low 69/90 vs 67/90, medium 75/90 vs 74/90, high 81/90 vs 76/90. |
| task-fast | agent | `agents/task-fast.md` | `task` worker for when wall-clock time matters; pair with a faster, costlier model in `task.agentModelOverrides`. Body must stay identical to `agents/task.md`. |
| repo-audit | agent | `agents/repo-audit.md` | Read-only whole-repo audit: doc/code drift, inconsistency, dead code, inefficiency, untested behavior. Ranked findings with file:line evidence; writes a report only to a path the caller names. |
| bench-runner | agent | `agents/bench-runner.md` | Runs a bench matrix through the repo's own run and score scripts in parallel. Waits out quota limits instead of switching models, discards runs answered by another model, regenerates the report page. |
| git-chores | agent | `agents/git-chores.md` | Gitignore/exclude, untrack, prune worktrees and caches, commit, push. Refuses history rewrites, force pushes and `--no-verify` unless named in the assignment. |
| role map | config | `config/roles.example.yml` | Model roles, agent overrides, fallback chains and compaction thresholds chosen from the bench results. Merge into `~/.omp/agent/config.yml`. |
| review bench | bench | `bench/review/` | Runs `readonly-reviewer` on diffs with planted bugs and behavior-preserving decoys (`<case>.diff` + `<case>.json`); scores recall, decoys flagged, cost, time per model and effort. |
| small-role bench | bench | `bench/small/` | Scores a tool-call fix, a commit subject, the bundled scout prompt, a multi-file spec fix with a decoy file, an exploration fix (bug copies reachable only by search, a frozen decoy, a lookalike that must stay) and a find-every-caller fix per model and effort. |
| gate tuning | bench | `bench/skillopt/` | Trains jev-effort-gate's Jev questions with SkillOpt against recorded `bench/small` runs; `report.py` writes a live HTML report. `train_review.py` trains the reviewer agents' prompt body against `bench/review` cases. |

## Install

1. Add the extensions and skill directory to `~/.omp/agent/config.yml`:

```yaml
extensions:
  - /path/to/harness-toolbox/extensions/search-guard.ts
  - /path/to/harness-toolbox/extensions/advisor-cross-family.ts
  - /path/to/harness-toolbox/extensions/jev-effort-gate.ts
  - /path/to/harness-toolbox/extensions/readonly-lsp.ts
  - /path/to/harness-toolbox/extensions/worker-skill-trim.ts
  - /path/to/harness-toolbox/extensions/subagent-scheduler.ts
extensionHandlers:
  toolCallTimeoutMs: 600000
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
for agent in task readonly-reviewer review-high review-low task-fast repo-audit bench-runner git-chores; do
  ln -s /path/to/harness-toolbox/agents/$agent.md ~/.omp/agent/agents/$agent.md
done
```

4. For `flame-graph`, install the renderer: `brew install flamegraph`.

5. Restart the harness.

Set `providers.webSearchTimeoutSeconds: 30`. Under parallel load the search provider chain grinds for a minute per failed call.

## Behavior

- **search-guard** counts calls process-wide, so parallel subagents share one budget. The 16th call is blocked with a read-the-URLs reason. A result starting `Error:` gets a no-retry suffix appended.
- **advisor-cross-family** runs at session start and on `retry_fallback_applied`, comparing the live model's family with the configured advisor's and overriding `modelRoles.advisor` to the first preference of another family. Subagent sessions are skipped. Limits: it reads the configured role, so a review that a fallback chain lands in the primary's family goes unfixed; keep primary-family models out of the advisor's chain by hand. The anthropic preference is `claude-sonnet-5-5` because Opus's chain returns to `gpt-6.2-sol`, which is the primary family in the case that entry serves. The openai-primary path has not been exercised end to end.
- **readonly-lsp** blocks by agent name, so a reviewer copied under another name gets an unrestricted `lsp`. Add the name to `READONLY_AGENTS`; `test/wiring.ts` fails when an agent has `lsp` without `edit`, `write` or `bash` and is not listed.

## Tests

```sh
bun run test
```

`test/simulate.ts` drives the guard through the load scenario. `test/wiring.ts` checks each extension against a fake harness API. `test/session-flame.ts` checks the folded stacks and timeline built from a session transcript.

## Bench

Runs use `omp -p` with retries, model fallback, and the advisor off (`bench/overlay.yml`). They spend subscription quota. Each run takes 10–40 s.

```sh
bench/review/run.sh <case> anthropic/claude-haiku-5-5:low <rep> [agent|prompt-file]
bench/small/run.sh <tools|commit|scout|task|explore|callers|expiry|guard> anthropic/claude-haiku-5-5:low <rep> [variant]   # env: RUN_TAG, AGENT_PROMPT, PROMPT_ONLY
python3 bench/review/score.py [case ...]
python3 bench/small/score.py
TYPESAFE_API_KEY=... python3 bench/small/replay.py   # fixed effort vs jev-effort-gate vs shuffled control, from existing runs
(cd bench/skillopt && ../.venv/bin/python train.py --config config.yaml)   # after: uv venv bench/.venv && uv pip install --python bench/.venv/bin/python -r bench/skillopt/requirements.txt
(cd bench/skillopt && ../.venv/bin/python train_review.py --config review.yaml)   # reviewer prompt; reward = recall − 0.25 × decoys flagged
(cd bench/skillopt && ../.venv/bin/python train_task.py --config task.yaml)   # task agent prompt; reward = hidden checks passed − 0.25 × decoy edited
```

Each scorer fails when a run was answered by a model other than the one requested.

Every `run.sh` and every omp subagent waits for a slot from `src/subagent-scheduler.pl`, shared fairly between worktrees (bench runs) and project directories (subagents); a bench run's `timeout` starts once it has one. The slot frees when the command exits, even if it leaves background children running. The cap starts at 12 and adapts every 2 s: it grows by 1 while runs wait, CPU idle is at least 25% and at least 15% of memory is free; it drops by a quarter on swapping, memory pressure, a no-op taking over 40 ms to spawn, or CPU idle under 10% for two samples, and does not drop again until runs above the new cap have finished. Changes are logged to `~/.cache/subagent-scheduler/control.log`. `SUBAGENT_SCHEDULER_SLOTS` fixes the cap and turns adaptation off.

Review bench limits:
- 17 cases; Haiku high finds 92–100% of planted defects on each and flags no decoy. Haiku low trails by 8–12 points on 6 cases.
- `train_review.py` trained a prompt on Haiku low that scored lower than the current prompt on unseen cases, so the reviewer agents keep their hand-written prompt.
- Training needs 15+ cases where the target effort still misses defects; with fewer, SkillOpt memorises case details.
- A decoy must be a change no reviewer can reasonably flag. A removed guard in an exported function is a defect under a "no behavior change" spec.
