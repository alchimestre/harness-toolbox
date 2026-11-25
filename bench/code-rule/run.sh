#!/usr/bin/env bash
# usage: run.sh <case> <model> <rep>
# Case = prompts/<case>.txt on fixtures/<kind>; kind is the case name before its first dash.
# Env: RUN_TAG overrides the output prefix; AGENT_PROMPT (file) is appended to the system prompt;
# PROMPT_ONLY=1 prints the assignment and exits.
set -u
[ -n "${BENCH_POOL_SLOT:-}${PROMPT_ONLY:-}" ] || exec perl "$(dirname "$0")/../pool.pl" bash "$0" "$@"
case_id=$1
model=$2
rep=$3
here=$(cd "$(dirname "$0")" && pwd)
kind=${case_id%%-*}
prompt_file="$here/prompts/$case_id.txt"
fixture="$here/fixtures/$kind"
if [ ! -f "$prompt_file" ] || [ ! -d "$fixture" ]; then
  echo "unknown case: $case_id" >&2
  exit 2
fi
prompt=$(cat "$prompt_file")
if [ -n "${PROMPT_ONLY:-}" ]; then
  printf '%s\n' "$prompt"
  exit 0
fi

tag=${RUN_TAG:-"$here/runs/${case_id}__${model//[\/:]/_}__${rep}"}
mkdir -p "$(dirname "$tag")"
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
cp -R "$fixture/." "$dir/"
cp "$here/../overlay.yml" "$dir/"

agent_args=()
if [ -n "${AGENT_PROMPT:-}" ]; then
  agent_args=(--append-system-prompt "$(cat "$AGENT_PROMPT")")
fi

run_scorer() {
  local out_file=$1 err_file=$2
  shift 2
  local text
  if text=$(timeout 30 "$@" 2> "$err_file"); then
    printf '%s\n' "$text" | tail -1 > "$out_file"
  else
    : > "$out_file"
  fi
}
start=$SECONDS
run_omp=(timeout 1800 omp)
(cd "$dir" && "${run_omp[@]}" -p --mode json --no-session --no-skills --no-extensions --no-lsp \
  --no-context-files --config overlay.yml --tools read,grep,glob,bash,edit,write \
  --model "$model" "${agent_args[@]+"${agent_args[@]}"}" "$prompt") > "$tag.jsonl" 2> "$tag.err"
status=$?
echo $((SECONDS - start)) > "$tag.secs"

run_scorer "$tag.parts" "$tag.fails" node "$here/hidden/$kind.js" "$dir"
run_scorer "$tag.static" "$tag.static_fails" node "$here/static.js" "$fixture" "$dir"
test_ok=no
if (cd "$dir" && timeout 30 node test.js >/dev/null 2>&1) && cmp -s "$fixture/test.js" "$dir/test.js"; then
  test_ok=yes
fi
rm -rf "$tag.ws"
cp -R "$dir" "$tag.ws"

parts=$(cat "$tag.parts")
static=$(cat "$tag.static")
hidden_ok=no
if [ -n "$parts" ] && [ "${parts%/*}" = "${parts#*/}" ]; then
  hidden_ok=yes
fi
static_ok=no
if [ "$static" = "5/5" ]; then
  static_ok=yes
fi
result=fail
if [ "$test_ok" = yes ] && [ "$hidden_ok" = yes ] && [ "$static_ok" = yes ]; then
  result=pass
fi
echo "$result" > "$tag.result"
printf '%s case=%s rep=%s hidden=%s static=%s test=%s exit=%s\n' \
  "$result" "$case_id" "$rep" "$parts" "$static" "$test_ok" "$status"
exit "$status"
