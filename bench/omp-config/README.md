# omp-config bench

Scores the omp-config agent prompt on config edits against a stub `omp` (config and models commands over a temp config dir; every call logged). Needs bun.
Checks parse the temp config.yml and example config, the stub call log (read-back after the final write, selector lookup), and the report.
Run: `bench/omp-config/run.sh <case> <provider/model:level> <rep>`; `AGENT_PROMPT=<file>` swaps the prompt, `RUN_TAG=<path prefix>` moves the output.
Cases: see `cases.md`; each run leaves `.jsonl .parts .fails .result .calls .secs`.
