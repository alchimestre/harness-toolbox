#!/usr/bin/env bash
# usage: run.sh <case> <provider/model:level> <rep> [agent]
# agent: a file in agents/, a built-in omp agent, or a path to a prompt file; readonly-reviewer (default) logs to
# runs/, others to runs/<agent>/. RUN_TAG=<absolute path prefix> overrides where the run's files go.
set -u
[ -n "${BENCH_POOL_SLOT:-}${PROMPT_ONLY:-}" ] || exec perl "$(dirname "$0")/../pool.pl" bash "$0" "$@"
case_=$1 model=$2 rep=$3 agent=${4:-readonly-reviewer}
prompt_file=
[ -f "$agent" ] && prompt_file=$(realpath "$agent")
cd "$(dirname "$0")"
out=runs
[ "$agent" = readonly-reviewer ] || out="runs/$(basename "$agent" .md)"
tag=${RUN_TAG:-"$out/${case_}__${model//\//_}__${rep}"}
mkdir -p "$(dirname "$tag")"
dir=$(mktemp -d)
if [ -n "$prompt_file" ]; then
  cp "$prompt_file" "$dir/agent.md"
elif [ -f "../../agents/$agent.md" ]; then
  cp "../../agents/$agent.md" "$dir/agent.md"
elif ! { omp agents unpack --dir "$dir/builtin" >/dev/null && mv "$dir/builtin/$agent.md" "$dir/agent.md"; }; then
  echo "run.sh: no prompt file, agents/ entry or built-in agent named '$agent'" >&2
  rm -r "$dir"
  exit 2
fi
rm -rf "$dir/builtin"
cp ../overlay.yml "$dir/"
source_note="no source on disk; review from the diff alone"
if [ -d "$case_" ]; then
  cp -R "$case_/." "$dir/"
  source_note="the post-change source is on disk; read unchanged files the diff depends on"
fi
prompt="Follow the reviewer instructions in agent.md (ignore its frontmatter). Review the diff and spec below. Repo root: this directory ($source_note).

$(cat "$case_.diff")"
start=$(date +%s)
run_omp=(timeout 300 omp)
(cd "$dir" && "${run_omp[@]}" -p --mode json --no-session --no-skills --no-extensions --no-lsp --no-context-files \
  --config overlay.yml --tools read,grep,glob,find --model "$model" "$prompt") > "$tag.jsonl" 2> "$tag.err"
status=$?
echo "$(( $(date +%s) - start ))" > "$tag.secs"
rm -r "$dir"
exit "$status"
