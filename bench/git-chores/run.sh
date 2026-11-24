#!/usr/bin/env bash
# usage: run.sh <case> <provider/model:level> <rep>
# RUN_TAG=<absolute path prefix> overrides where the run's files go; AGENT_PROMPT (absolute file) is appended to the system prompt.
# PROMPT_ONLY=1 prints the assignment and exits without running.
set -u
case=$1 model=$2 rep=$3
here=$(cd "$(dirname "$0")" && pwd)
[ -f "$here/cases/$case.txt" ] || { echo "unknown case $case" >&2; exit 2; }
prompt=$(cat "$here/cases/$case.txt")
if [ -n "${PROMPT_ONLY:-}" ]; then printf '%s\n' "$prompt"; exit 0; fi
tag=${RUN_TAG:-$here/runs/${case}__${model//\//_}__${rep}}
mkdir -p "$(dirname "$tag")"
dir=$(cd "$(mktemp -d)" && pwd -P)
cp "$here/../overlay.yml" "$dir/overlay.yml"
export GIT_CONFIG_GLOBAL=$dir/gitconfig GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0
"$here/fixture.sh" "$dir" "$case" || { echo "fixture failed: $case" >&2; rm -rf "$dir"; exit 3; }
start=$(date +%s)
rm -f "$tag.result" "$tag.parts" "$tag.fails"
append=(); [ -n "${AGENT_PROMPT:-}" ] && append=(--append-system-prompt "$AGENT_PROMPT")
(cd "$dir/work" && OMP_RUN_TIMEOUT=300 omp -p --mode json --no-session --no-skills --no-extensions --no-context-files --no-rules \
  --config "$dir/overlay.yml" --tools read,grep,glob,bash,edit,write --model "$model" "${append[@]}" "$prompt") > "$tag.jsonl" 2> "$tag.err"
status=$?
echo "$(( $(date +%s) - start ))" > "$tag.secs"
python3 "$here/check.py" "$case" "$dir" "$tag.jsonl" 2> "$tag.fails" | tail -1 > "$tag.parts"
IFS=/ read -r passed total < "$tag.parts" || true
[ "${passed:-x}" = "${total:-y}" ] && echo pass > "$tag.result" || echo fail > "$tag.result"
rm -rf "$dir"
exit "$status"
