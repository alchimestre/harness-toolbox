#!/usr/bin/env bash
# usage: run.sh <tools|commit|scout|task> <provider/model:level> <rep>
set -u
kind=$1 model=$2 rep=$3
here=$(cd "$(dirname "$0")" && pwd)
cd "$here"
mkdir -p runs
[ -f scout.md ] || { unpacked=$(mktemp -d); omp agents unpack --dir "$unpacked" >/dev/null && cp "$unpacked/scout.md" .; rm -r "$unpacked"; }
tag="${kind}__${model//\//_}__${rep}"
dir=$(mktemp -d); cp ../overlay.yml "$dir/"
if [ "$kind" = tools ]; then
  cp -R fixture/. "$dir/"
  tools=read,grep,glob,find,edit,write,bash
  prompt="node test.js fails. Find the cause, fix it in the source (not the test), and run node test.js until it prints ok. Reply with one line naming the file you changed."
elif [ "$kind" = task ]; then
  cp -R task-fixture/. "$dir/"
  tools=read,grep,glob,find,edit,write,bash
  prompt="node test.js fails. Make the code match SPEC.md. Fix the source, not the test, and run node test.js until it prints ok. Reply with one line per file you changed."
elif [ "$kind" = scout ]; then
  cp -R fixture/. "$dir/"; sed '1,/^---$/{/^---$/!d;};1,/^---$/d' scout.md > "$dir/SCOUT.md"
  tools=read,grep,glob,find
  prompt="Follow the instructions in SCOUT.md. Question: which function does slugify use to collapse repeated dashes, where is it defined, and which other file defines a function that does the same job? Answer with file:line for each."
else
  tools=read
  prompt="Write a conventional-commit subject line (max 72 chars) for this diff. Output only the subject line.

$(cat commit.diff)"
fi
start=$(date +%s)
(cd "$dir" && timeout 300 omp -p --mode json --no-session --no-skills --no-extensions --no-context-files \
  --config overlay.yml --tools "$tools" --model "$model" "$prompt") > "runs/$tag.jsonl" 2> "runs/$tag.err"
echo "$(( $(date +%s) - start ))" > "runs/$tag.secs"
if [ "$kind" = tools ] || [ "$kind" = task ]; then
  fixture=fixture check="node test.js"
  [ "$kind" = task ] && fixture=task-fixture check="node $here/check-task.js ."
  (cd "$dir" && $check >/dev/null 2>&1 && git diff --no-index --quiet "$here/$fixture/test.js" test.js) && echo pass > "runs/$tag.result" || echo fail > "runs/$tag.result"
  [ "$kind" = task ] && ! git diff --no-index --quiet "$here/task-fixture/src/legacy/money.js" "$dir/src/legacy/money.js" && touch "runs/$tag.decoy"
fi
rm -r "$dir"
