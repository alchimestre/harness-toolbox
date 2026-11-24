#!/usr/bin/env bash
# usage: run.sh <case> <provider/model:level> <rep>   (case = <fixture>-<wording>, see cases.md)
# RUN_TAG=<absolute path prefix> overrides where the run's files go; AGENT_PROMPT (absolute file) is appended after ponytail.md.
# PROMPT_ONLY=1 prints the user prompt and exits without running.
set -u
case_name=$1 model=$2 rep=$3
here=$(cd "$(dirname "$0")" && pwd)
fixture=${case_name%%-*}
prompt=$(cat "$here/cases/$case_name.txt")
if [ -n "${PROMPT_ONLY:-}" ]; then printf '%s\n' "$prompt"; exit 0; fi
tag=${RUN_TAG:-$here/runs/${case_name}__${model//\//_}__$rep}
mkdir -p "$(dirname "$tag")"
dir=$(mktemp -d); system=$(mktemp)
cp "$here/../overlay.yml" "$dir/"; cp -R "$here/fixtures/$fixture/." "$dir/"
cat "$here/ponytail.md" > "$system"
[ -n "${AGENT_PROMPT:-}" ] && { printf '\n' >> "$system"; cat "$AGENT_PROMPT" >> "$system"; }
rm -f "$tag.result" "$tag.parts" "$tag.fails"
start=$(date +%s)
# A slot-queueing omp wrapper that honours OMP_RUN_TIMEOUT starts the clock after admission; plain omp needs timeout.
run_omp=(timeout 300 omp)
head -c 8192 "$(command -v omp)" | grep -aq OMP_RUN_TIMEOUT && run_omp=(env OMP_RUN_TIMEOUT=300 omp)
(cd "$dir" && "${run_omp[@]}" -p --mode json --no-session --no-skills --no-extensions --no-context-files --no-rules \
  --config overlay.yml --tools read,grep,glob,bash,edit,write --model "$model" --append-system-prompt "$system" "$prompt") > "$tag.jsonl" 2> "$tag.err"
status=$?
echo "$(( $(date +%s) - start ))" > "$tag.secs"
node "$here/check.js" "$fixture" "$here/fixtures/$fixture" "$dir" "$tag.jsonl" 2> "$tag.fails" | tail -1 > "$tag.parts"
IFS=/ read -r got total < "$tag.parts"
[ "${got:-0}" = "${total:-x}" ] && echo pass > "$tag.result" || echo fail > "$tag.result"
rm -r "$dir" "$system"
exit "$status"
