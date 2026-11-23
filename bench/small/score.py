import glob
import os
import json
import re
import statistics
from collections import defaultdict

COMMIT_SUBJECT = re.compile(r"^(fix|feat|perf|refactor)(\([\w-]+\))?!?: .{5,}$")
COMMIT_TOPIC = re.compile(r"dedup|in-?flight|concurrent|pending|share", re.I)


def read_run(path):
    cost = 0.0
    calls = errors = 0
    responders = set()
    answer = ""
    for line in open(path):
        event = json.loads(line)
        kind = event.get("type")
        message = event.get("message") or {}
        if kind == "turn_end":
            responders.add(f"{message.get('provider')}/{message.get('model')}")
            turn_usage = event.get("usage") or message.get("usage")
            if turn_usage:
                cost += turn_usage["cost"]["total"]
        elif kind == "tool_execution_end":
            calls += 1
            errors += bool(event.get("isError") or (event.get("result") or {}).get("isError"))
        elif kind == "message_end" and message.get("role") == "assistant":
            text = "".join(p.get("text", "") for p in message.get("content", []) if p.get("type") == "text")
            answer = text.strip() or answer
    return cost, calls, errors, responders, answer


def passed(kind, tag, answer):
    if kind == "tools":
        return open(f"runs/{tag}.result").read().strip() == "pass"
    if kind == "scout":
        return all(re.search(p, answer) for p in (r"lib/util\.js:\d", r"\bcollapse\b", r"lib/legacy/strings\.js:\d", r"\bsqueeze\b"))
    subject = answer.splitlines()[0].strip("` ") if answer else ""
    return bool(COMMIT_SUBJECT.match(subject)) and len(subject) <= 72 and bool(COMMIT_TOPIC.search(subject))


def main():
    rows = defaultdict(lambda: defaultdict(list))
    for path in sorted(glob.glob("runs/*.jsonl")):
        tag = path[5:-6]
        kind, model, _rep = tag.split("__")
        cost, calls, errors, responders, answer = read_run(path)
        expected = model.replace("_", "/", 1).split(":")[0]
        assert responders == {expected}, f"{path}: answered by {responders}"
        secs = int(open(f"runs/{tag}.secs").read())
        rows[model][kind].append((passed(kind, tag, answer), cost, calls, errors, secs))
        if kind == "commit":
            print(f"{model}: {answer.splitlines()[0] if answer else '<empty>'}")
    print("\n| model:effort | tool task pass | tool calls | tool errors | commit pass | scout pass | $ per run | secs |")
    print("|---|---|---|---|---|---|---|---|")
    for model, kinds in sorted(rows.items(), key=lambda item: item[0]):
        tools = kinds.get("tools", [])
        commit = kinds.get("commit", [])
        scout = kinds.get("scout", [])
        runs = tools + commit + scout
        print(
            f"| {model.replace('anthropic_', '')} | {sum(r[0] for r in tools)}/{len(tools)} "
            f"| {statistics.mean(r[2] for r in tools) if tools else 0:.1f} | {sum(r[3] for r in tools)} "
            f"| {sum(r[0] for r in commit)}/{len(commit)} | {sum(r[0] for r in scout)}/{len(scout)} | {statistics.mean(r[1] for r in runs):.4f} "
            f"| {statistics.mean(r[4] for r in runs):.0f} |"
        )


os.chdir(os.path.dirname(os.path.abspath(__file__)))
main()
