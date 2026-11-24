#!/usr/bin/env bash
# usage: run.sh <case> <provider/model:level> <rep>
# RUN_TAG=<path prefix> sets where result files go (default runs/); AGENT_PROMPT=<file> is the prompt under test
# (default: skills/omp-config/SKILL.md without frontmatter). PROMPT_ONLY=1 prints the assignment and exits.
# Each run gets a temp sandbox; the stub omp serves config and models commands from it.
set -u
case=$1 model=$2 rep=$3
here=$(cd "$(dirname "$0")" && pwd)
cd "$here" || exit 2
prompt=$(bun check.ts prompt "$case") || exit 2
if [ -n "${PROMPT_ONLY:-}" ]; then
  printf '%s\n' "$prompt"
  exit 0
fi
family=$(bun check.ts family "$case") || exit 2
fixtures="$here/fixtures/$family"
mkdir -p runs
tag=${RUN_TAG:-"runs/${case}__${model//\//_}__${rep}"}
real_omp=$(command -v omp)
real_config="${PI_CODING_AGENT_DIR:-$HOME/.omp/agent}/config.yml"
root=$(mktemp -d)
mkdir -p "$root/bin" "$root/cfg" "$root/repo/config"
ln -s "$here/stub/omp" "$root/bin/omp"
cp "$fixtures/live.yml" "$root/cfg/config.yml"
cp "$fixtures/repo/config/roles.example.yml" "$root/repo/config/"
cp "$here/fixtures/overlay.yml" "$root/overlay.yml"
if bun check.ts project "$case"; then
  mkdir -p "$root/repo/.omp"
  cp "$fixtures/project/config.yml" "$root/repo/.omp/config.yml"
fi
(cd "$root/repo" && git init -q && git add -A && git -c commit.gpgsign=false -c user.email=bench@example.com -c user.name=bench commit -qm base)
agent_prompt=${AGENT_PROMPT:-"$root/agent.md"}
if [ -z "${AGENT_PROMPT:-}" ]; then
  awk '/^---$/ && fences < 2 { fences++; next } fences >= 2' ../../skills/omp-config/SKILL.md > "$agent_prompt"
fi
: > "$root/calls.log"
real_before=$(shasum -a 256 "$real_config" | cut -d' ' -f1)
start=$(date +%s)
rm -f "$tag".{result,parts,fails,calls,real,commits,secs}
run_omp=(timeout 300 "$real_omp")
head -c 8192 "$real_omp" | grep -aq OMP_RUN_TIMEOUT && run_omp=(env OMP_RUN_TIMEOUT=300 "$real_omp")
(cd "$root/repo" && PATH="$root/bin:$PATH" OMP_STUB_DIR="$root/cfg" OMP_STUB_LOG="$root/calls.log" \
  "${run_omp[@]}" -p --mode json --no-session --no-skills --no-extensions --no-context-files --no-rules \
  --config "$root/overlay.yml" --tools read,grep,glob,find,bash,edit --model "$model" \
  --append-system-prompt "$agent_prompt" "$prompt") > "$tag.jsonl" 2> "$tag.err"
status=$?
echo "$(( $(date +%s) - start ))" > "$tag.secs"
printf '%s\n%s\n' "$real_before" "$(shasum -a 256 "$real_config" | cut -d' ' -f1)" > "$tag.real"
cp "$root/calls.log" "$tag.calls"
git -C "$root/repo" rev-list --count HEAD > "$tag.commits"
check_out=$(bun check.ts check "$case" "$root" "$tag" 2> "$tag.fails")
checked=$?
printf '%s\n' "$check_out" | tail -1 > "$tag.parts"
if [ "$checked" -eq 2 ] || [ "$status" -eq 137 ] || [ "$status" -eq 143 ]; then
  echo missing > "$tag.result"
elif [ "$status" -eq 0 ] && [ "$checked" -eq 0 ]; then
  echo pass > "$tag.result"
else
  echo fail > "$tag.result"
fi
rm -r "$root"
if [ "$(cat "$tag.result")" = missing ]; then
  exit 4
fi
exit "$status"
