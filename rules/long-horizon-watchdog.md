---
alwaysApply: true
agents: main
description: Watch long-horizon subagents and background jobs on a clock. Load when spawning or supervising work that will run past ten minutes.
---

# Long-horizon watchdog

A subagent that stalls, loops, or dies quietly is the failure this rule exists to catch. A job still listed as running is not a report.

- Name every spawn expected to run past ten minutes, and keep its agent id and job id in the todo list.
- The watchdog extension injects a tick while such a job runs. With it disabled, arm the clock yourself: one `bash` call, `async: true`, `command` `sleep 600`, `timeout` 660, re-armed at every tick until the work is accounted for.

On each tick, in this order:

1. `read proc://` for job and service states.
2. `read agent://<id>` for each non-terminal job — status and progress while its output is unpublished.
3. `read history://<id>` for any job past two ticks, or whose progress has not moved.
4. Classify each one: progressing, stalled, looping, or dead.

Then act per job:

- Progressing — leave it alone.
- Stalled — `write agent://<id>` one narrow steer: name the blocker to report, restate the acceptance criterion, cap the next step.
- Looping or off-scope — `write proc://<id>/kill`, then respawn one narrower slice. Never respawn the same shape.
- Dead — read the transcript tail, name the cause, then respawn or absorb the work yourself.

Run the check in the parent. A delegated health check reports the health checker, not the work.

Close every tick with one visible line per live job: id, elapsed, state, last visible progress, action taken. A tick that produces no line is a failed tick. With nothing live, say so in one line and stop ticking.
