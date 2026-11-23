#!/usr/bin/env bash
# usage: run.sh <easy|hard|subtle> <provider/model:level> <rep> [agent]
# agent: a file in agents/ or a built-in omp agent; readonly-reviewer (default) logs to runs/, others to runs/<agent>/.
set -u
case_=$1 model=$2 rep=$3 agent=${4:-readonly-reviewer}
cd "$(dirname "$0")"
out=runs
[ "$agent" = readonly-reviewer ] || out="runs/$agent"
mkdir -p "$out"
tag="$out/${case_}__${model//\//_}__${rep}"
dir=$(mktemp -d)
if [ -f "../../agents/$agent.md" ]; then
  cp "../../agents/$agent.md" "$dir/agent.md"
else
  omp agents unpack --dir "$dir/builtin" >/dev/null && mv "$dir/builtin/$agent.md" "$dir/agent.md" && rm -r "$dir/builtin"
fi
cp ../overlay.yml "$dir/"
prompt="Follow the reviewer instructions in agent.md (ignore its frontmatter). Review the diff and spec below. Repo root: this directory (no source on disk; review from the diff alone).

$(cat "$case_.diff")"
start=$(date +%s)
(cd "$dir" && timeout 300 omp -p --mode json --no-session --no-skills --no-extensions --no-context-files \
  --config overlay.yml --tools read,grep,glob,find --model "$model" "$prompt") > "$tag.jsonl" 2> "$tag.err"
echo "$(( $(date +%s) - start ))" > "$tag.secs"
rm -r "$dir"
