#!/usr/bin/env bash
# usage: run.sh <scenario> <provider/model:level> <rep>
# RUN_TAG=<absolute path prefix> overrides where the run's files go; AGENT_PROMPT (absolute file) is appended to the system prompt.
# PROMPT_ONLY=1 prints the assignment and exits without running.
set -u
[ -n "${BENCH_POOL_SLOT:-}${PROMPT_ONLY:-}" ] || exec perl "$(dirname "$0")/../pool.pl" bash "$0" "$@"
scenario=$1 model=$2 rep=$3
here=$(cd "$(dirname "$0")" && pwd)
cd "$here"
prompt=$(python3 scenarios.py prompt "$scenario") || exit 2
if [ -n "${PROMPT_ONLY:-}" ]; then printf '%s\n' "$prompt"; exit 0; fi
mkdir -p runs
tag="runs/${scenario}__${model//\//_}__${rep}"
tag=${RUN_TAG:-$tag}
dir=$(mktemp -d)
python3 scenarios.py setup "$scenario" "$dir"
start=$(date +%s)
rm -rf "$tag.result" "$tag.parts" "$tag.fails" "$tag.log"
append=(); [ -n "${AGENT_PROMPT:-}" ] && append=(--append-system-prompt "$AGENT_PROMPT")
run_omp=(timeout 900 omp)
(cd "$dir" && PYTHONDONTWRITEBYTECODE=1 "${run_omp[@]}" -p --mode json --no-session --no-skills --no-extensions --no-lsp --no-context-files --no-rules \
  --config "$here/../overlay.yml" --tools read,grep,glob,find,bash,write --model "$model" ${append[@]+"${append[@]}"} "$prompt") > "$tag.jsonl" 2> "$tag.err"
status=$?
echo "$(( $(date +%s) - start ))" > "$tag.secs"
checked=$(python3 check.py "$dir" "$scenario" "$tag.jsonl" 2> "$tag.fails")
if [ $? -eq 0 ]; then echo pass > "$tag.result"; else echo fail > "$tag.result"; fi
printf '%s\n' "$checked" | tail -1 > "$tag.parts"
[ -d "$dir/.log" ] && cp -R "$dir/.log" "$tag.log"
rm -r "$dir"
exit "$status"
