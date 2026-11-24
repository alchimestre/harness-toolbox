"""Scores review runs: a judge model decides which planted defects each review identifies.
Each case is <case>.diff plus <case>.json listing its defects and decoys (changes that look suspicious but
preserve behavior; the judge sees them unlabeled among the defects).
Verdicts are cached next to each run as <tag>.judged.json; delete them to rejudge."""

import glob
import json
import os
import statistics
import subprocess
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

JUDGE_MODEL = "anthropic/claude-sonnet-5-5:low"
JUDGE_WORKERS = 12
HERE = os.path.dirname(os.path.abspath(__file__))
CASES = {os.path.basename(path)[:-5]: json.load(open(path)) for path in sorted(glob.glob(os.path.join(HERE, "*.json")))}
DEFECTS = {case: spec["defects"] for case, spec in CASES.items()}
DECOYS = {case: spec["decoys"] for case, spec in CASES.items() if spec["decoys"]}


def main(cases):
    echo_reviews = [(f"{case}.diff", case, "Looks good to me.\n\n" + open(f"{case}.diff").read()) for case in cases]
    echo_scores = judge_all(echo_reviews, cache=False)
    leaks = {key: found for key, found in echo_scores.items() if found}
    assert not leaks, f"judge credits a review that only pastes the diff back: {leaks}"

    paths = [path for path in glob.glob("runs/**/*.jsonl", recursive=True)
             if os.path.basename(path).split("__")[0] in cases]
    reviews = [(path, os.path.basename(path).split("__")[0], final_text(path)) for path in paths]
    verdicts = judge_all([review for review in reviews if review[2]], cache=True)
    print_table(paths, verdicts, cases)
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
    claims = {**DEFECTS[case], **DECOYS.get(case, {})}
    names = list(claims)
    numbered = "\n".join(f"{index + 1}. {claims[name]}" for index, name in enumerate(names))
    prompt = (
        "Below are numbered defects in a code change, then a code review of that change. For each defect, decide "
        "whether the reviewer identifies that specific defect in their own words: they must state the faulty behavior. "
        "Quoted code, diffs, or file names never count, even when the defect is visible in them; do not find defects "
        "yourself. Reply with only a JSON object mapping each defect number to true or false.\n\n"
        f"Defects:\n{numbered}\n\nReview:\n<review>\n{review}\n</review>"
    )
    command = ["omp", "-p", "--no-session", "--no-skills", "--no-extensions", "--no-context-files", "--no-tools",
               "--model", JUDGE_MODEL, prompt]
    output = subprocess.run(command, capture_output=True, text=True, timeout=180, check=True).stdout
    answers, _end = json.JSONDecoder().raw_decode(output[output.index("{"):])
    found = [name for index, name in enumerate(names) if answers.get(str(index + 1)) is True]
    if cache:
        json.dump(found, open(cache_path, "w"))
    return found


def print_table(paths, verdicts, columns):
    rows = defaultdict(lambda: defaultdict(list))
    for path in paths:
        parent = os.path.basename(os.path.dirname(path))
        agent = "readonly-reviewer" if parent == "runs" else parent
        case, model, _rep = os.path.basename(path)[:-6].split("__")
        cost, output, responders = usage(path)
        expected = model.replace("_", "/", 1).split(":")[0]
        assert responders == {expected}, f"{path}: answered by {responders}"
        secs = int(open(path[:-6] + ".secs").read())
        found = verdicts.get(path, [])
        recall = sum(name in DEFECTS[case] for name in found) / len(DEFECTS[case])
        flagged = sum(name in DECOYS.get(case, {}) for name in found)
        rows[f"{agent} {model.replace('anthropic_', '')}"][case].append((recall, cost, output, secs, flagged))
    print("| agent model:effort | " + " | ".join(f"{case} recall" for case in columns)
          + " | decoys flagged per review | $ per review | output tok | secs |")
    print("|---|" + "---|" * (len(columns) + 4))
    for model in sorted(rows):
        cases = rows[model]
        runs = [run for case_runs in cases.values() for run in case_runs]
        recall = [f"{statistics.mean(run[0] for run in cases[case]):.0%}" if case in cases else "-" for case in columns]
        decoy_runs = [run for case in DECOYS if case in cases for run in cases[case]]
        flagged = f"{statistics.mean(run[4] for run in decoy_runs):.2f}" if decoy_runs else "-"
        print(
            f"| {model} | " + " | ".join(recall) + f" | {flagged} "
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
    os.chdir(HERE)
    main(sys.argv[1:] or list(DEFECTS))
