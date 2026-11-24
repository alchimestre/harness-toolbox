"""Reads an omp --mode json event log: cost, tool calls, tool errors, answering models, final answer."""
import json


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
