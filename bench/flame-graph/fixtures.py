"""Fixtures, assignments and ground truth for the flame-graph bench.

usage: fixtures.py build <case> <dir> | prompt <case> <dir>
Every subject is generated from the specs below, so the expected totals are known by construction.
"""

import json
import sys
from pathlib import Path

TREE_FILES = {
    "src/core/engine.js": 30000,
    "src/core/parser.js": 12000,
    "src/ui/view.js": 8000,
    "src/ui/styles/main.css": 3000,
    "src/ui/styles/dark.css": 1500,
    "src/index.js": 500,
    "assets/logo.png": 25000,
    "assets/fonts/body.woff": 9000,
    "docs/guide.md": 2000,
    "docs/api/ref;v2.md": 1200,
    "docs/api/notes draft.md": 800,
    ".github/ci.yml": 700,
    "README.md": 300,
    "LICENSE": 1100,
}

TIMING_SUITES = {
    "api": {
        "users": {"creates a user": 0.42, "GET /users/:id": 0.125, "rejects a bad email": 0.06},
        "billing": {"charges a card": 1.8, "refunds a charge": 0.95, "rounds half up": 0.04},
    },
    "ui": {
        "forms": {"submits the form": 0.75, "shows field errors": 0.31},
        "nav": {"opens the menu": 0.22},
    },
    "db": {"migrates up": 2.4, "migrates down": 1.35},
}

TREE_FILES_ODD = {
    "my app/src/ünïcode.js": 5000,
    "my app/src/-flags.js": 2200,
    "my app/src/a;b.js": 1100,
    "my app/docs/read me.md": 900,
    "my app/src/deep/er/est/leaf.txt": 400,
}

TIMING_SUITES_ODD = {
    "api": {"users": {"creates": 0.4, "users": 0.2}, "auth": {"logs in": 0.15}},
    "ui": {"api": {"fetch": 0.6}},
}

TREE_FILES_FINAL = {
    "app/main.py": 4200,
    "app/db/models.py": 9100,
    "app/db/migrations/0001.sql": 2600,
    "app/api/routes.py": 6800,
    "app/api/auth.py": 1900,
    "tests/test_api.py": 3300,
    "tests/conftest.py": 400,
    "scripts/seed.sh": 350,
    "pyproject.toml": 700,
    "Makefile": 250,
}

TIMING_SUITES_FINAL = {
    "unit": {"parse": {"reads header": 0.11, "reads body": 0.34}, "emit": {"writes header": 0.07}},
    "e2e": {"checkout": {"pays order": 2.9, "sends receipt": 0.6}},
    "lint": {"ruff": 1.1},
}

TREE_FAMILIES = {"dev": TREE_FILES, "odd": TREE_FILES_ODD, "final": TREE_FILES_FINAL}
TIMING_FAMILIES = {"dev": TIMING_SUITES, "odd": TIMING_SUITES_ODD, "final": TIMING_SUITES_FINAL}

BASE_MS = 1_795_000_000_000
RATES = {"input": 1, "output": 5, "cacheRead": 0.1, "cacheWrite": 1.25}  # micro-dollars per token
USAGE_KINDS = list(RATES)

SESSION_TITLE = "Billing refactor"
SESSION_STEM = "2026-11-20T10-00-00-000Z_01a0b1c2"


def usage(input_, output, cache_read, cache_write):
    tokens = dict(input=input_, output=output, cacheRead=cache_read, cacheWrite=cache_write)
    cost = {kind: tokens[kind] * RATES[kind] / 1e6 for kind in USAGE_KINDS}
    return {**tokens, "totalTokens": sum(tokens.values()), "cost": {**cost, "total": sum(cost.values())}}


def call(model, at, duration, ttft, usage_, tools=()):
    """tools: (id, name, intent). The result of each is a separate toolResult record."""
    content = [{"type": "text", "text": "ok"}]
    content += [{"type": "toolCall", "id": i, "name": n, "intent": t, "arguments": {}} for i, n, t in tools]
    message = {"role": "assistant", "model": model, "timestamp": BASE_MS + at, "duration": duration,
               "ttft": ttft, "usage": usage_, "content": content}
    return {"type": "message", "message": message}


def result(call_id, at, wall_ms=None):
    message = {"role": "toolResult", "toolCallId": call_id, "timestamp": BASE_MS + at, "content": []}
    if wall_ms is not None:
        message["details"] = {"wallTimeMs": wall_ms}
    return {"type": "message", "message": message}


MAIN_MODEL = "claude-sonnet-5-5"
WORKER_MODEL = "claude-haiku-5-5"

MAIN = [
    {"type": "session", "id": "01a0b1c2", "title": SESSION_TITLE},
    call(MAIN_MODEL, 0, 800, 300, usage(1200, 400, 8000, 2000),
         [("a", "bash", "Run billing tests"), ("b", "read", "Open invoice module"), ("c", "grep", "Find callers")]),
    result("b", 1000),
    result("c", 1300),
    result("a", 3000, 1200),
    call(MAIN_MODEL, 3100, 1500, 400, usage(900, 600, 12000, 0),
         [("d", "task", "Delegate review"), ("e", "bash", "Compare old; new totals")]),
    result("e", 5000, 900),
    result("d", 12100),
    call(MAIN_MODEL, 12200, 1000, 350, usage(300, 250, 20000, 800)),
]
WORKER = [
    call(WORKER_MODEL, 4700, 1000, 250, usage(500, 200, 3000, 400),
         [("f", "read", "Read the diff"), ("g", "read", "Read the tests")]),
    result("f", 5800),
    result("g", 6000),
    call(WORKER_MODEL, 6100, 2000, 500, usage(700, 900, 6000, 0), [("h", "task", "Check edge cases")]),
    result("h", 11000),
    call(WORKER_MODEL, 11100, 800, 300, usage(200, 100, 9000, 0)),
]
LEAF = [
    call(WORKER_MODEL, 8200, 1200, 350, usage(400, 500, 2000, 800), [("i", "bash", "Run edge tests")]),
    result("i", 10000, 1500),
    call(WORKER_MODEL, 10100, 700, 200, usage(100, 150, 4000, 0)),
]

# (agent path, name, detail, start, duration, estimated, ttft, usage) for every model call and tool call
AGENTS = [([SESSION_TITLE], MAIN), ([SESSION_TITLE, "agent:Worker"], WORKER),
          ([SESSION_TITLE, "agent:Worker", "agent:Leaf"], LEAF)]


def spans(entries, path):
    """Independent reading of the transcript: model calls and tool calls with their times."""
    found, pending = [], {}
    for entry in entries:
        message = entry["message"] if entry["type"] == "message" else None
        if message and message["role"] == "assistant":
            end = message["timestamp"] + message["duration"]
            found.append(dict(path=path, name=f"model:{message['model']}", detail=None, start=message["timestamp"],
                              dur=message["duration"], estimated=False, ttft=message["ttft"], usage=message["usage"]))
            for part in message["content"]:
                if part["type"] == "toolCall":
                    pending[part["id"]] = dict(path=path, name=f"tool:{part['name']}", detail=part["intent"],
                                               start=end, dur=0, estimated=False, ttft=None, usage=None)
        if message and message["role"] == "toolResult":
            tool = pending[message["toolCallId"]]
            wall = message.get("details", {}).get("wallTimeMs")
            if wall is None:
                tool.update(dur=message["timestamp"] - tool["start"], estimated=True)
            else:
                tool.update(dur=wall, start=message["timestamp"] - wall)
            found.append(tool)
    return found


def all_spans(agents=AGENTS):
    return [s for path, entries in agents for s in spans(entries, path)]


def frame(text):
    return " ".join(text.replace(";", " ").split())


def session_leaves(measure, agents=AGENTS):
    totals = {}
    for s in all_spans(agents):
        base = tuple(frame(p) for p in s["path"]) + (s["name"],)
        if measure == "ms" and s["ttft"] is not None:
            parts = [(("first token",), s["ttft"]), (("generation",), s["dur"] - s["ttft"])]
        elif measure == "ms":
            parts = [((frame(s["detail"]),) if s["detail"] else (), s["dur"])]
        elif s["usage"] is None:
            parts = []
        elif measure == "tokens":
            parts = [((k,), s["usage"][k]) for k in USAGE_KINDS]
        else:
            parts = [((k,), s["usage"][k] * RATES[k]) for k in USAGE_KINDS]
        for tail, value in parts:
            totals[base + tail] = totals.get(base + tail, 0) + value
    return {stack: round(v) for stack, v in totals.items() if round(v) > 0}


def session_trace(agents=AGENTS):
    """Expected timeline events: (process name, event name, ts us, dur us, interval)."""
    found = all_spans(agents)
    origin = min(s["start"] for s in found)
    events = []
    for s in found:
        name = f"{s['name']}: {s['detail']}" if s["detail"] else s["name"]
        interval = "dispatch to result" if s["estimated"] else "measured"
        events.append((" > ".join(s["path"]), name, (s["start"] - origin) * 1000, s["dur"] * 1000, interval))
    return events


def timing_leaves(data=TIMING_SUITES):
    leaves = {}
    for suite, body in data.items():
        for name, value in body.items():
            if isinstance(value, dict):
                for test, seconds in value.items():
                    leaves[(suite, name, test)] = round(seconds * 1000)
            else:
                leaves[(suite, name)] = round(value * 1000)
    return leaves


def timing_json(data=TIMING_SUITES):
    def suite(name, body):
        if all(isinstance(v, dict) for v in body.values()):
            children = [suite(n, b) for n, b in body.items()]
            return {"name": name, "totalSeconds": round(sum(c["totalSeconds"] for c in children), 3), "suites": children}
        tests = [{"name": n, "seconds": s, "status": "pass"} for n, s in body.items()]
        return {"name": name, "totalSeconds": round(sum(t["seconds"] for t in tests), 3), "tests": tests}

    suites = [suite(name, body) for name, body in data.items()]
    total = round(sum(s["totalSeconds"] for s in suites), 3)
    return {"run": "ci-1042", "unit": "seconds", "totalSeconds": total, "suites": suites}


def tree_leaves(base="", files=TREE_FILES):
    prefix = base.strip("/")
    leaves = {}
    for path, size in files.items():
        if prefix and not path.startswith(prefix + "/"):
            continue
        rest = path[len(prefix) + 1:] if prefix else path
        leaves[tuple(rest.split("/"))] = size
    return leaves


def nodes_of(leaves):
    """Every prefix of every leaf stack with the sum of the leaves below it."""
    nodes = {}
    for stack, value in leaves.items():
        for depth in range(1, len(stack) + 1):
            nodes[stack[:depth]] = nodes.get(stack[:depth], 0) + value
    return nodes


# case -> kind, measure unit (as flamegraph.pl titles it), prompt, plus optional extras
SESSION_FILE = "sessions/{stem}.jsonl".format(stem=SESSION_STEM)
CASES = {
    "tree-pointed": dict(kind="tree", unit="bytes", out=True, prompt=
        "Draw a flame graph of the directory {dir}/proj. A frame's width is the file size in bytes. "
        "Write the output into {dir}/out."),
    "tree-terse": dict(kind="tree", unit="bytes", out=True, prompt=
        "flame graph of {dir}/proj, bytes, output {dir}/out"),
    "tree-urgent": dict(kind="tree", unit="bytes", out=True, prompt=
        "URGENT: the disk is filling up and I need to see right now which part of {dir}/proj takes the space. "
        "Flame graph of its file sizes, output in {dir}/out. Be quick."),
    "tree-sub": dict(kind="tree", unit="bytes", out=True, base="src", prompt=
        "Flame graph of just {dir}/proj/src, sized in bytes, output to {dir}/out."),
    "tree-noout": dict(kind="tree", unit="bytes", out=False, prompt=
        "Flame graph of the directory {dir}/proj by file size."),
    "timing-pointed": dict(kind="timing", unit="ms", out=True, prompt=
        "{dir}/times.json holds the test timings of one CI run. Draw a flame graph of where the test time went, "
        "width in milliseconds, output directory {dir}/out."),
    "timing-terse": dict(kind="timing", unit="ms", out=True, prompt=
        "flamegraph of {dir}/times.json, test times in ms, output {dir}/out"),
    "session-ms": dict(kind="session", measure="ms", unit="ms", out=True, prompt=
        "Draw a flame graph of the session transcript {dir}/" + SESSION_FILE + ": where did the time go? "
        "Output directory {dir}/out."),
    "session-timeline": dict(kind="session", measure="ms", unit="ms", out=True, trace=True, prompt=
        "From the session transcript {dir}/" + SESSION_FILE + " I need to see what happened when. "
        "Give me the flame graph of the time and the timeline of its calls. Output directory {dir}/out."),
    "session-tokens": dict(kind="session", measure="tokens", unit="tokens", out=True, prompt=
        "Flame graph of the session transcript {dir}/" + SESSION_FILE + " in tokens. Output directory {dir}/out."),
    "session-cost": dict(kind="session", measure="microusd", unit="microusd", out=True, prompt=
        "Flame graph of what the session {dir}/" + SESSION_FILE + " cost. Output directory {dir}/out."),
    "session-agent": dict(kind="session", measure="ms", unit="ms", out=True, agent="Worker", prompt=
        "In the session {dir}/" + SESSION_FILE + ", the agent named Worker looks slow. "
        "Flame graph of that agent alone, in ms, output directory {dir}/out."),
    "empty-dir": dict(kind="empty", unit="bytes", out=True, prompt=
        "Flame graph of the directory {dir}/proj by size, output {dir}/out."),
    "missing-subject": dict(kind="missing", unit="bytes", out=True, prompt=
        "Flame graph of the directory {dir}/data/2026 by size, output {dir}/out."),
    "tree-odd": dict(kind="tree", unit="bytes", out=True, family="odd", prompt=
        "Draw a flame graph of the directory {dir}/proj by file size, bytes. Output directory {dir}/out."),
    "timing-odd": dict(kind="timing", unit="ms", out=True, family="odd", prompt=
        "{dir}/times.json holds the test timings of one CI run. Draw a flame graph of where the test time went, "
        "width in milliseconds, output directory {dir}/out."),
    "tree-final": dict(kind="tree", unit="bytes", out=True, family="final", prompt=
        "Draw a flame graph of the directory {dir}/proj. A frame's width is the file size in bytes. "
        "Write the output into {dir}/out."),
    "timing-final": dict(kind="timing", unit="ms", out=True, family="final", prompt=
        "flamegraph of {dir}/times.json, test times in ms, output {dir}/out"),
}


def agent_entries(agent):
    """The agents a case covers; one agent's file also folds the agents below it, rooted at that agent."""
    if not agent:
        return AGENTS
    return [([agent], WORKER), ([agent, "agent:Leaf"], LEAF)]


def expected_leaves(case):
    spec = CASES[case]
    kind = spec["kind"]
    if kind == "tree":
        return tree_leaves(spec.get("base", ""), TREE_FAMILIES[spec.get("family", "dev")])
    if kind == "timing":
        return timing_leaves(TIMING_FAMILIES[spec.get("family", "dev")])
    if kind == "session":
        return session_leaves(spec["measure"], agent_entries(spec.get("agent")))
    return {}


def build(case, root):
    root = Path(root)
    spec = CASES[case]
    kind = spec["kind"]
    if spec["out"]:
        (root / "out").mkdir(parents=True, exist_ok=True)
    if kind == "tree":
        for rel, size in TREE_FAMILIES[spec.get("family", "dev")].items():
            path = root / "proj" / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"x" * size)
    elif kind == "empty":
        (root / "proj" / "src" / "empty").mkdir(parents=True)
        (root / "proj" / "docs").mkdir()
    elif kind == "timing":
        (root / "times.json").write_text(json.dumps(timing_json(TIMING_FAMILIES[spec.get("family", "dev")]), indent=2))
    elif kind == "session":
        sessions = root / "sessions"
        (sessions / SESSION_STEM / "Worker").mkdir(parents=True)
        lines = lambda entries: "\n".join(json.dumps(e) for e in entries) + "\n"
        (sessions / f"{SESSION_STEM}.jsonl").write_text(lines(MAIN))
        (sessions / SESSION_STEM / "Worker.jsonl").write_text(lines(WORKER))
        (sessions / SESSION_STEM / "Worker" / "Worker.Leaf.jsonl").write_text(lines(LEAF))


if __name__ == "__main__":
    action, case, target = sys.argv[1:4]
    if action == "build":
        build(case, target)
    else:
        print(CASES[case]["prompt"].format(dir=target))
