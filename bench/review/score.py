import glob
import os
import json
import re
import statistics
from collections import defaultdict

FINDINGS = {
    "easy": {
        "shell injection": r"inject|execSync.*shell|command execution|RCE",
        "path traversal": r"travers|\.\./|escape[sd]? uploads|outside uploads",
        "uncaught crash": r"crash|uncaught|process (exits|dies|terminates)|throws? .*(non-zero|missing)|ENOENT",
    },
    "hard": {
        "page offset": r"off-by-one|\(page\s*-\s*1\)|page - 1|skips? the first (page|20)|first page",
        "refund IDOR": r"IDOR|any user|another user|user_id.*refund|ownership|owns|authoriz",
        "double refund race": r"race|TOCTOU|concurren|atomic|twice|double[- ]refund",
        "timing-unsafe HMAC": r"timingSafeEqual|timing|constant[- ]time",
    },
    "subtle": {
        "TTL units": r"millisecond|seconds? (vs|versus|instead)|\* 1000|600 ?ms|TTL.*(ms|unit)",
        "no in-flight dedup": r"in-flight|inflight|thundering|dedup|pending promise|stampede|concurrent(ly)? fetch",
        "forEach async": r"forEach.*async|async.*forEach|returns? (before|0)|not awaited|Promise\.all|for\.\.\.of",
        "per-line rounding": r"round(ing|s|ed)? (per|each) line|round.*once|half[- ]even|banker",
    },
}


def final_text(path):
    text = ""
    for line in open(path):
        event = json.loads(line)
        message = event.get("message") or {}
        if event.get("type") == "message_end" and message.get("role") == "assistant":
            parts = [p.get("text", "") for p in message.get("content", []) if p.get("type") == "text"]
            if parts:
                text = "\n".join(parts)
    return text


def usage(path):
    cost = output = 0.0
    responders = set()
    for line in open(path):
        event = json.loads(line)
        if event.get("type") != "turn_end":
            continue
        message = event.get("message") or {}
        turn_usage = event.get("usage") or message.get("usage")
        responders.add(f"{message.get('provider')}/{message.get('model')}")
        if turn_usage:
            cost += turn_usage["cost"]["total"]
            output += turn_usage["output"]
    return cost, output, responders


def main():
    rows = defaultdict(lambda: defaultdict(list))
    for path in glob.glob("runs/*.jsonl"):
        case, model, _rep = path[5:-6].split("__")
        text = final_text(path)
        found = [name for name, pattern in FINDINGS[case].items() if re.search(pattern, text, re.I)]
        cost, output, responders = usage(path)
        expected = model.replace("_", "/", 1).split(":")[0]
        assert responders == {expected}, f"{path}: answered by {responders}"
        secs = int(open(path[:-6] + ".secs").read())
        rows[model][case].append((len(found) / len(FINDINGS[case]), cost, output, secs, bool(text)))
    print("| model:effort | easy recall | hard recall | subtle recall | $ per review | output tok | secs |")
    print("|---|---|---|---|---|---|---|")
    for model in sorted(rows, key=lambda m: statistics.mean(r[1] for c in rows[m].values() for r in c)):
        cases = rows[model]
        runs = [r for c in cases.values() for r in c]
        recall = {c: f"{statistics.mean(r[0] for r in cases[c]):.0%}" for c in cases}
        print(
            f"| {model.replace('anthropic_', '')} | {recall.get('easy', '-')} | {recall.get('hard', '-')} | {recall.get('subtle', '-')} "
            f"| {statistics.mean(r[1] for r in runs):.4f} | {statistics.mean(r[2] for r in runs):.0f} "
            f"| {statistics.mean(r[3] for r in runs):.0f} |"
        )
    empty = [p for p in glob.glob("runs/*.jsonl") if not final_text(p)]
    if empty:
        print("\nno final answer:", *empty, sep="\n")


os.chdir(os.path.dirname(os.path.abspath(__file__)))
main()
