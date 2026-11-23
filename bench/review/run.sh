#!/usr/bin/env bash
# usage: run.sh <easy|hard|subtle> <provider/model:level> <rep>
set -u
case_=$1 model=$2 rep=$3
cd "$(dirname "$0")"
mkdir -p runs
tag="${case_}__${model//\//_}__${rep}"
dir=$(mktemp -d)
cp ../../agents/readonly-reviewer.md "$dir/agent.md"
cp ../overlay.yml "$dir/"
prompt="Follow the reviewer instructions in agent.md (ignore its frontmatter). Review the diff and spec below. Repo root: this directory (no source on disk; review from the diff alone).

$(cat "$case_.diff")"
start=$(date +%s)
(cd "$dir" && timeout 300 omp -p --mode json --no-session --no-skills --no-extensions --no-context-files \
  --config overlay.yml --tools read,grep,glob,find --model "$model" "$prompt") > "runs/$tag.jsonl" 2> "runs/$tag.err"
echo "$(( $(date +%s) - start ))" > "runs/$tag.secs"
rm -r "$dir"
