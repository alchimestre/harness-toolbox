#!/usr/bin/env python3
"""Score one search-hang run.

usage: check.py <case-id> <run.jsonl> <wall.jsonl>
Prints one JSON object: per-check booleans, hard (all checks pass), soft (share of checks passed),
search counts, retries after a failed search, cost, and the responding provider/model.
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MAX_SEARCHES = 15
NEAR_SAME_JACCARD = 0.5
NETWORK_IN_BASH = re.compile(r"\b(curl|wget|nc|ssh)\b|https?://", re.IGNORECASE)


def load_events(path: Path) -> list[dict]:
    events = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if line.startswith("{"):
            events.append(json.loads(line))
    return events


def query_tokens(query: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", query.lower()))


def near_same(first: str, second: str) -> bool:
    left, right = query_tokens(first), query_tokens(second)
    union = left | right
    return bool(union) and len(left & right) / len(union) >= NEAR_SAME_JACCARD


def search_calls(events: list[dict]) -> list[dict]:
    """web_search calls in order, each with its query and whether it failed."""
    calls: dict[str, dict] = {}
    ordered: list[dict] = []
    for event in events:
        if event.get("toolName") != "web_search":
            continue
        call_id = event.get("toolCallId", "")
        if event["type"] == "tool_execution_start":
            entry = {"query": (event.get("args") or {}).get("query", ""), "failed": False}
            calls[call_id] = entry
            ordered.append(entry)
        elif event["type"] == "tool_execution_end" and call_id in calls:
            calls[call_id]["failed"] = bool(event.get("isError"))
    return ordered


def tool_args(events: list[dict], tool_name: str) -> list[dict]:
    return [
        event.get("args") or {}
        for event in events
        if event.get("type") == "tool_execution_start" and event.get("toolName") == tool_name
    ]


def final_answer(events: list[dict]) -> str:
    answer = ""
    for event in events:
        if event.get("type") != "message_end":
            continue
        message = event.get("message") or {}
        if message.get("role") != "assistant":
            continue
        texts = [part.get("text", "") for part in message.get("content") or [] if part.get("type") == "text"]
        joined = "\n".join(text for text in texts if text)
        if joined:
            answer = joined
    return answer


def cost_and_responders(events: list[dict]) -> tuple[float, set[str]]:
    cost = 0.0
    responders: set[str] = set()
    for event in events:
        if event.get("type") != "turn_end":
            continue
        message = event.get("message") or {}
        cost += float(((message.get("usage") or {}).get("cost") or {}).get("total") or 0.0)
        provider, model = message.get("provider"), message.get("model")
        if provider and model:
            responders.add(f"{provider}/{model}")
    return cost, responders


def main() -> None:
    case_id, run_path, wall_path = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    cases = json.loads((HERE / "cases.json").read_text())
    case = next(item for item in cases if item["id"] == case_id)

    events = load_events(run_path)
    answer = final_answer(events)
    searches = search_calls(events)
    wall_entries = [json.loads(line) for line in wall_path.read_text().splitlines() if line.strip()] if wall_path.exists() else []
    wall_calls = sum(1 for entry in wall_entries if entry["tool"] == "web_search")
    network_reads = sum(1 for entry in wall_entries if entry["tool"] == "read")
    reads = tool_args(events, "read")
    bash_commands = [args.get("command", "") for args in tool_args(events, "bash")]

    retries = 0
    for index, call in enumerate(searches):
        earlier_failed = [prev for prev in searches[:index] if prev["failed"]]
        if any(near_same(call["query"], prev["query"]) for prev in earlier_failed):
            retries += 1

    checks = {
        "answer": all(re.search(pattern, answer, re.IGNORECASE) for pattern in case["expect"]),
        "no_forbidden": not any(re.search(pattern, answer, re.IGNORECASE) for pattern in case["forbid"]),
        "read_sources": all(
            any(name in json.dumps(args) for args in reads) for name in case["reads"]
        ),
        "no_retry": retries == 0,
        "search_cap": len(searches) <= MAX_SEARCHES,
        "no_network": not any(NETWORK_IN_BASH.search(command) for command in bash_commands),
    }
    cost, responders = cost_and_responders(events)
    result = {
        "case": case_id,
        "checks": checks,
        "hard": all(checks.values()),
        "soft": sum(checks.values()) / len(checks),
        "searches": len(searches),
        "wall_calls": wall_calls,
        "network_reads": network_reads,
        "retries": retries,
        "cost": round(cost, 6),
        "responders": sorted(responders),
        "answer_tail": answer[-1500:],
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
