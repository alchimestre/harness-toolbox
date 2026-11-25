#!/usr/bin/env bash
# usage: run.sh <case-id> <provider/model[:level]> <rep>
# env: RUN_TAG   output prefix (default bench/skillopt/runs/search-hang/)
#      AGENT_PROMPT  file appended to the system prompt (the skill body under test)
set -u
[ -n "${BENCH_POOL_SLOT:-}${PROMPT_ONLY:-}" ] || exec perl "$(dirname "$0")/../pool.pl" bash "$0" "$@"

case_id=$1
model=$2
rep=$3
here=$(cd "$(dirname "$0")" && pwd)
cases="$here/cases.json"

fixtures=$(jq -r --arg id "$case_id" '.[] | select(.id == $id) | .fixtures[]' "$cases")
prompt=$(jq -r --arg id "$case_id" '.[] | select(.id == $id) | .prompt' "$cases")
if [ -z "$prompt" ] || [ "$prompt" = "null" ]; then
  echo "unknown case: $case_id" >&2
  exit 2
fi

tag_default="$here/../skillopt/runs/search-hang/${case_id}__${model//\//_}__${rep}"
tag=${RUN_TAG:-$tag_default}
mkdir -p "$(dirname "$tag")"
: > "$tag.wall.jsonl"

sandbox=$(mktemp -d)
trap 'rm -rf "$sandbox"' EXIT
mkdir -p "$sandbox/library"
for family in $fixtures; do
  cp -R "$here/fixtures/$family" "$sandbox/library/"
done
cp "$here/../overlay.yml" "$sandbox/overlay.yml"
prompt=${prompt//__ROOT__/$sandbox}

append=()
if [ -n "${AGENT_PROMPT:-}" ]; then
  append=(--append-system-prompt "$(cat "$AGENT_PROMPT")")
fi

start=$(date +%s)
(
  cd "$sandbox" && \
  SEARCH_WALL_LOG="$tag.wall.jsonl" timeout 1200 omp -p --no-lsp \
    --mode json --no-session --no-skills --no-extensions \
    --no-context-files --no-rules \
    -e "$here/wall.ts" \
    --config overlay.yml \
    --tools read,grep,glob,bash,web_search \
    --model "$model" \
    "${append[@]}" \
    "$prompt"
) > "$tag.jsonl" 2> "$tag.err"
status=$?
echo $(( $(date +%s) - start )) > "$tag.secs"

python3 "$here/check.py" "$case_id" "$tag.jsonl" "$tag.wall.jsonl" > "$tag.result.json" || { rm -f "$tag.result.json"; exit 1; }
exit "$status"
