#!/usr/bin/env bash
# usage: run.sh <case> <provider/model:level> <rep>      case = <repo>-<terse|pointed|urgent|casual>, repo in a b c d e f
# AGENT_PROMPT=<absolute file> is appended to the system prompt (default: the body of agents/repo-audit.md).
# RUN_TAG=<absolute path prefix> overrides where the run's files go. PROMPT_ONLY=1 prints the assignment and exits.
set -u
case_=$1 model=$2 rep=$3
repo_id=${case_%%-*} variant=${case_#*-}
here=$(cd "$(dirname "$0")" && pwd)
cd "$here"
[ -d "fixtures/$repo_id" ] || { echo "run.sh: unknown case $case_" >&2; exit 2; }
mkdir -p runs
tag=${RUN_TAG:-"$here/runs/${case_}__${model//\//_}__${rep}"}
dir=$(mktemp -d)
mkdir "$dir/tmp"
report="$dir/report.md"
case "$variant" in
  terse) prompt="Audit this repo. Report path: $report" ;;
  pointed) prompt="Audit the repository in the current directory on every axis: drift between README and code, inconsistencies, dead code, inefficiency, swallowed errors, missing tests. Report path: $report" ;;
  urgent) prompt="The release goes out in an hour. Audit the repository in the current directory now and tell me what is actually broken or stale. Report path: $report" ;;
  casual) prompt="Hey, could you look over this repo and tell me what's off? Report path: $report" ;;
  *) echo "run.sh: unknown variant $variant" >&2; rm -r "$dir"; exit 2 ;;
esac
if [ -n "${PROMPT_ONLY:-}" ]; then printf '%s\n' "$prompt"; rm -r "$dir"; exit 0; fi
prompt_file=${AGENT_PROMPT:-"$dir/seed.md"}
[ -z "${AGENT_PROMPT:-}" ] && awk 'n >= 2 { print } /^---$/ { n++ }' ../../agents/repo-audit.md > "$prompt_file"
cp ../overlay.yml "$dir/"
cp -R "fixtures/$repo_id" "$dir/repo"
git="git -c user.name=bench -c user.email=bench@example.invalid -c commit.gpgsign=false"
(cd "$dir/repo" && git init -q && git add -A && $git commit -qm seed)
python3 check.py --manifest "$dir/repo" > "$dir/before.json"
start=$(date +%s)
rm -f "$tag".{result,parts,fails,detail.json,report.md}
# A slot-queueing omp wrapper that honours OMP_RUN_TIMEOUT starts the clock after admission; plain omp needs timeout.
run_omp=(timeout 900 omp)
head -c 8192 "$(command -v omp)" | grep -aq OMP_RUN_TIMEOUT && run_omp=(env OMP_RUN_TIMEOUT=900 omp)
(cd "$dir/repo" && TMPDIR="$dir/tmp" "${run_omp[@]}" -p --mode json --no-session --no-skills --no-extensions \
  --no-context-files --no-rules --config "$dir/overlay.yml" --tools read,grep,glob,find,bash,write \
  --model "$model" --append-system-prompt "$prompt_file" "$prompt") > "$tag.jsonl" 2> "$tag.err"
status=$?
echo "$(( $(date +%s) - start ))" > "$tag.secs"
[ -f "$report" ] && cp "$report" "$tag.report.md"
python3 check.py "$repo_id" "$dir/repo" "$report" "$dir/before.json" "$tag.detail.json" 2> "$tag.fails" | tail -1 > "$tag.parts"
python3 -c 'import json,sys; sys.exit(0 if json.load(open(sys.argv[1]))["hard"] else 1)' "$tag.detail.json" && echo pass > "$tag.result" || echo fail > "$tag.result"
rm -r "$dir"
exit "$status"
