#!/usr/bin/env bash
# usage: run.sh <case> <provider/model:level> <rep>
# RUN_TAG=<absolute path prefix> overrides where the run's files go; AGENT_PROMPT (absolute file) is appended to the system prompt.
# PROMPT_ONLY=1 prints the assignment and exits without running.
set -u
[ -n "${SUBAGENT_SCHEDULER_SLOT:-}${PROMPT_ONLY:-}" ] || exec perl "$(dirname "$0")/../../src/subagent-scheduler.pl" bash "$0" "$@"
case_=$1 model=$2 rep=$3
here=$(cd "$(dirname "$0")" && pwd)
cd "$here"
family=${case_%%-*}
prompt=$(cat "cases/$case_.txt")
if [ -n "${PROMPT_ONLY:-}" ]; then printf '%s\n' "$prompt"; exit 0; fi
tag="runs/${case_}__${model//\//_}__${rep}"
tag=${RUN_TAG:-$tag}
mkdir -p "$(dirname "$tag")"
dir=$(mktemp -d); cp ../overlay.yml "$dir/"
fixture="facts/$case_.md"; [ -f "$fixture" ] || fixture="facts/$family.md"; cp "$fixture" "$dir/facts.md"
start=$(date +%s)
rm -f "$tag.result" "$tag.parts" "$tag.fails" "$tag.out" "$tag.exit"
append=(); [ -n "${AGENT_PROMPT:-}" ] && append=(--append-system-prompt "$AGENT_PROMPT")
run_omp=(timeout 300 omp)
(cd "$dir" && "${run_omp[@]}" -p --mode json --no-session --no-skills --no-extensions --no-lsp --no-context-files --no-rules \
  --config overlay.yml --tools read,write --model "$model" "${append[@]}" "$prompt") > "$tag.jsonl" 2> "$tag.err"
status=$?
echo "$status" > "$tag.exit"
echo "$(( $(date +%s) - start ))" > "$tag.secs"
python3 check.py "$family" "$dir" "$case_" 2> "$tag.fails" | tail -1 > "$tag.parts"
[ "${PIPESTATUS[0]}" -eq 0 ] && echo pass > "$tag.result" || echo fail > "$tag.result"
rm "$dir/facts.md"; cat "$dir"/*.md > "$tag.out" 2>/dev/null
rm -r "$dir"
exit "$status"
