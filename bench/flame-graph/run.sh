#!/usr/bin/env bash
# usage: run.sh <case> <provider/model:level> <rep>   (cases: see cases.md)
# RUN_TAG=<absolute path prefix> overrides where the run's files go; AGENT_PROMPT (absolute file) is appended to the system prompt.
# PROMPT_ONLY=1 prints the assignment and exits without running.
set -u
[ -n "${SUBAGENT_SCHEDULER_SLOT:-}${PROMPT_ONLY:-}" ] || exec perl "$(dirname "$0")/../../src/subagent-scheduler.pl" bash "$0" "$@"
case_name=$1 model=$2 rep=$3
here=$(cd "$(dirname "$0")" && pwd)
cd "$here"
mkdir -p runs
tag="runs/${case_name}__${model//\//_}__${rep}"
tag=${RUN_TAG:-$tag}
dir=$(mktemp -d); dir=$(cd "$dir" && pwd -P)
cp ../overlay.yml "$dir/"
mkdir "$dir/tmp"
python3 fixtures.py build "$case_name" "$dir" || exit 3
prompt=$(python3 fixtures.py prompt "$case_name" "$dir")
if [ -n "${PROMPT_ONLY:-}" ]; then printf '%s\n' "$prompt"; rm -r "$dir"; exit 0; fi
start=$(date +%s)
rm -f "$tag.result" "$tag.parts" "$tag.fails"
append=(); [ -n "${AGENT_PROMPT:-}" ] && append=(--append-system-prompt "$AGENT_PROMPT")
(cd "$dir" && TMPDIR="$dir/tmp" timeout 400 omp -p --mode json --no-session --no-skills --no-extensions --no-lsp --no-context-files --no-rules \
  --config overlay.yml --tools read,grep,glob,bash --model "$model" "${append[@]}" "$prompt") > "$tag.jsonl" 2> "$tag.err"
status=$?
echo "$(( $(date +%s) - start ))" > "$tag.secs"
python3 -c 'import sys; sys.path.insert(0, "."); import score; open(sys.argv[2], "w").write(score.read_run(sys.argv[1])[4])' "$tag.jsonl" "$tag.answer" || { echo "answer parse failed: $tag" >&2; rm -r "$dir"; exit 4; }
python3 check.py "$case_name" "$dir" "$tag.answer" 2> "$tag.fails" | tail -1 > "$tag.parts"
parts=$(cat "$tag.parts"); [ -n "$parts" ] && [ "${parts%/*}" = "${parts#*/}" ] && echo pass > "$tag.result" || echo fail > "$tag.result"
rm -r "$dir"
exit "$status"
