#!/usr/bin/env bash
# usage: run.sh <tools|commit|scout|task|explore|callers|expiry|guard> <provider/model:level> <rep> [variant]
# A variant replaces the prompt with variants/<kind>/<variant>.txt; same fixture and checks.
set -u
kind=$1 model=$2 rep=$3 variant=${4:-}
here=$(cd "$(dirname "$0")" && pwd)
cd "$here"
mkdir -p runs/variants
[ -f scout.md ] || { unpacked=$(mktemp -d); omp agents unpack --dir "$unpacked" >/dev/null && cp "$unpacked/scout.md" .; rm -r "$unpacked"; }
tag="${kind}__${model//\//_}__${rep}"
[ -n "$variant" ] && tag="variants/${kind}-${variant}__${model//\//_}__${rep}"
dir=$(mktemp -d); cp ../overlay.yml "$dir/"
if [ "$kind" = tools ]; then
  cp -R fixture/. "$dir/"
  tools=read,grep,glob,find,edit,write,bash
  prompt="node test.js fails. Find the cause, fix it in the source (not the test), and run node test.js until it prints ok. Reply with one line naming the file you changed."
elif [ -f "check-$kind.js" ]; then
  cp -R "$kind-fixture/." "$dir/"
  tools=read,grep,glob,find,edit,write,bash
  prompt="node test.js fails. Make the code match SPEC.md. Fix the source, not the test, and run node test.js until it prints ok. Reply with one line per file you changed."
  [ "$kind" = explore ] && prompt="A customer was charged 0.28 for an item priced 0.29. node test.js reproduces one instance. Make the whole codebase comply with SPEC.md, fix the source (not the test), and run node test.js until it prints ok. Reply with one line per file you changed."
  [ "$kind" = callers ] && prompt="node test.js fails: checkout charges shipping on a parcel without its packaging. Make the code comply with SPEC.md, fix the source (not the test), and run node test.js until it prints ok. Reply with one line per file you changed."
  [ "$kind" = expiry ] && prompt="node test.js fails: a new session's expiry lands in January 1970 instead of one hour from now. Make the code comply with SPEC.md, fix the source (not the test), and run node test.js until it prints ok. Reply with one line per file you changed."
  [ "$kind" = guard ] && prompt="node test.js fails: deleteUser refuses an admin user with 403. Make the code comply with SPEC.md, fix the source (not the test), and run node test.js until it prints ok. Reply with one line per file you changed."
elif [ "$kind" = scout ]; then
  cp -R fixture/. "$dir/"; sed '1,/^---$/{/^---$/!d;};1,/^---$/d' scout.md > "$dir/SCOUT.md"
  tools=read,grep,glob,find
  prompt="Follow the instructions in SCOUT.md. Question: which function does slugify use to collapse repeated dashes, where is it defined, and which other file defines a function that does the same job? Answer with file:line for each."
else
  tools=read
  prompt="Write a conventional-commit subject line (max 72 chars) for this diff. Output only the subject line.

$(cat commit.diff)"
fi
[ -n "$variant" ] && prompt=$(cat "variants/$kind/$variant.txt")
start=$(date +%s)
rm -f "runs/$tag.decoy" "runs/$tag.result" "runs/$tag.parts"
(cd "$dir" && timeout 300 omp -p --mode json --no-session --no-skills --no-extensions --no-context-files \
  --config overlay.yml --tools "$tools" --model "$model" "$prompt") > "runs/$tag.jsonl" 2> "runs/$tag.err"
echo "$(( $(date +%s) - start ))" > "runs/$tag.secs"
if [ "$kind" = tools ]; then
  (cd "$dir" && node test.js >/dev/null 2>&1 && git diff --no-index --quiet "$here/fixture/test.js" test.js) && echo pass > "runs/$tag.result" || echo fail > "runs/$tag.result"
elif [ -f "check-$kind.js" ]; then
  node "$here/check-$kind.js" "$dir" 2>/dev/null | tail -1 > "runs/$tag.parts"
  (node "$here/check-$kind.js" "$dir" >/dev/null 2>&1 && git diff --no-index --quiet "$here/$kind-fixture/test.js" "$dir/test.js") && echo pass > "runs/$tag.result" || echo fail > "runs/$tag.result"
  git diff --no-index --quiet "$here/$kind-fixture/src/legacy" "$dir/src/legacy" || touch "runs/$tag.decoy"
fi
rm -r "$dir"
