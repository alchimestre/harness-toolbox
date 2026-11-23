"""Scores review runs: a judge model decides which planted defects each review identifies.
Verdicts are cached next to each run as <tag>.judged.json; delete them to rejudge."""

import glob
import json
import os
import statistics
import subprocess
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

JUDGE_MODEL = "anthropic/claude-sonnet-5-5:low"
JUDGE_WORKERS = 12

DEFECTS = {
    "easy": {
        "shell injection": "The name parameter is concatenated into an execSync shell command, allowing command injection.",
        "path traversal": "Names containing ../ read files outside uploads/; the spec requires a 400.",
        "uncaught crash": "execSync throws on a missing file (cat exits non-zero) and the exception is not handled, crashing or failing the request.",
    },
    "hard": {
        "page offset": "OFFSET is page * 20 with pages starting at 1, so page 1 skips the first 20 invoices.",
        "refund IDOR": "refund never checks that the invoice belongs to the signed-in user, so any user can refund anyone's invoice.",
        "double refund race": "The refunded check and the UPDATE are not atomic, so concurrent requests can refund the same invoice twice.",
        "timing-unsafe HMAC": "The signature is compared with != instead of a constant-time comparison (timing attack).",
    },
    "subtle": {
        "TTL units": "TTL is in seconds (600) but compared with a millisecond difference, so the cache expires after 600 ms instead of 10 minutes.",
        "no in-flight dedup": "Concurrent getRate calls for the same currency all fetch; the spec allows at most one fetch in flight per currency.",
        "forEach async": "totalEUR uses forEach with an async callback, so it returns before any line is added (returns 0).",
        "per-line rounding": "Each line is rounded separately instead of rounding the total once, as the spec requires.",
    },
    "algo": {
        "binary search never terminates": "tierRate's loop sets lo = mid; when hi = lo + 1 and tiers[mid].min <= amount, mid == lo and the loop never terminates.",
        "refill rate divided twice": "refillPerMs is already divided by 1000 and is multiplied by elapsed seconds, so the bucket refills 1000 times too slowly.",
        "eviction on update": "set evicts the least recently used entry when the cache is full even if the key already exists, so updating an existing key drops another entry.",
        "percentile p=1 out of range": "percentile indexes sorted[floor(p * length)], which is past the end (undefined) for p = 1.",
    },
    "algo2": {
        "touching intervals not merged": "merge now uses start < last.end, so touching intervals such as [0,30) and [30,60) are no longer merged.",
        "chunk drops trailing items": "chunk's new loop bound and tail condition drop trailing items (for example the last item of a 5-item list in chunks of 2).",
        "ring shift keeps count": "Ring.shift no longer decrements count, so the ring's size and later pushes are wrong after a shift.",
        "negative weekday index": "shiftWeekday dropped the + 7 normalization, so negative offsets index the array with a negative number and return undefined.",
    },
}


def main():
    echo_scores = judge_all([(f"{case}.diff", case, open(f"{case}.diff").read()) for case in DEFECTS], cache=False)
    leaks = {key: found for key, found in echo_scores.items() if found}
    assert not leaks, f"judge credits a review that only pastes the diff back: {leaks}"

    paths = glob.glob("runs/**/*.jsonl", recursive=True)
    reviews = [(path, os.path.basename(path).split("__")[0], final_text(path)) for path in paths]
    verdicts = judge_all([review for review in reviews if review[2]], cache=True)
    print_table(paths, verdicts)
    empty = [path for path, _case, text in reviews if not text]
    if empty:
        print("\nno final answer:", *empty, sep="\n")


def judge_all(reviews, cache):
    with ThreadPoolExecutor(JUDGE_WORKERS) as pool:
        found = pool.map(lambda review: judged(*review, cache=cache), reviews)
    return {review[0]: names for review, names in zip(reviews, found)}


def judged(key, case, review, cache):
    cache_path = key[:-6] + ".judged.json"
    if cache and os.path.exists(cache_path):
        return json.load(open(cache_path))
    names = list(DEFECTS[case])
    numbered = "\n".join(f"{index + 1}. {DEFECTS[case][name]}" for index, name in enumerate(names))
    prompt = (
        "Below are numbered defects in a code change, then a code review of that change. For each defect, decide "
        "whether the review identifies that specific defect: it must state the faulty behavior, not merely quote the "
        "code or mention the file. Reply with only a JSON object mapping each defect number to true or false.\n\n"
        f"Defects:\n{numbered}\n\nReview:\n<review>\n{review}\n</review>"
    )
    command = ["omp", "-p", "--no-session", "--no-skills", "--no-extensions", "--no-context-files", "--no-tools",
               "--model", JUDGE_MODEL, prompt]
    output = subprocess.run(command, capture_output=True, text=True, timeout=180, check=True).stdout
    answers = json.loads(output[output.index("{"):output.rindex("}") + 1])
    found = [name for index, name in enumerate(names) if answers.get(str(index + 1)) is True]
    if cache:
        json.dump(found, open(cache_path, "w"))
    return found


def print_table(paths, verdicts):
    rows = defaultdict(lambda: defaultdict(list))
    for path in paths:
        parent = os.path.basename(os.path.dirname(path))
        agent = "readonly-reviewer" if parent == "runs" else parent
        case, model, _rep = os.path.basename(path)[:-6].split("__")
        cost, output, responders = usage(path)
        expected = model.replace("_", "/", 1).split(":")[0]
        assert responders == {expected}, f"{path}: answered by {responders}"
        secs = int(open(path[:-6] + ".secs").read())
        recall = len(verdicts.get(path, [])) / len(DEFECTS[case])
        rows[f"{agent} {model.replace('anthropic_', '')}"][case].append((recall, cost, output, secs))
    print("| agent model:effort | " + " | ".join(f"{case} recall" for case in DEFECTS) + " | $ per review | output tok | secs |")
    print("|---|" + "---|" * (len(DEFECTS) + 3))
    for model in sorted(rows):
        cases = rows[model]
        runs = [run for case_runs in cases.values() for run in case_runs]
        recall = [f"{statistics.mean(run[0] for run in cases[case]):.0%}" if case in cases else "-" for case in DEFECTS]
        print(
            f"| {model} | " + " | ".join(recall) + " "
            f"| {statistics.mean(run[1] for run in runs):.4f} | {statistics.mean(run[2] for run in runs):.0f} "
            f"| {statistics.mean(run[3] for run in runs):.0f} |"
        )


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


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    main()
