"""Hidden checks for one flame-graph run: parses the SVG, never needs a browser.

usage: check.py <case> <sandbox dir> <answer file>
The last stdout line is passed/total; each failing check prints `fail: <name>` on stderr.
"""

import hashlib
import json
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

import fixtures

WIDTH_TOLERANCE = 0.02
MIN_WIDTH_TOLERANCE = 0.001
UNIT_ALIASES = {"bytes": {"bytes", "byte"}, "ms": {"ms", "milliseconds"}, "tokens": {"tokens"}, "microusd": {"microusd"}}
TITLE = re.compile(r"^(.*) \(([\d,.]+) (\S+), [\d.]+%\)$", re.S)
TITLE_KEYWORDS = {"tree": ["proj"], "timing": ["times", "ci-1042", "test"], "session": ["billing", "01a0b1c2", "worker"]}
ESTIMATED_TOOLS = {None: ["read", "grep", "task"], "Worker": ["read", "task"]}
WINDOW = 300


def local(tag):
    return tag.rsplit("}", 1)[-1]


def norm(name):
    return re.sub(r"[^A-Za-z0-9.]", "_", name)


def parse_svg(path):
    """Returns (root node, nodes, title text); a node is a dict of name, samples, unit, x, y, w, path."""
    tree = ET.parse(path).getroot()
    nodes = []
    for group in tree.iter():
        if local(group.tag) != "g":
            continue
        children = {local(c.tag): c for c in group}
        if "title" not in children or "rect" not in children:
            continue
        match = TITLE.match(children["title"].text or "")
        rect = children["rect"].attrib
        if not match or "width" not in rect:
            continue
        nodes.append(dict(name=match[1], samples=float(match[2].replace(",", "")), unit=match[3],
                          x=float(rect["x"]), y=float(rect["y"]), w=float(rect["width"])))
    title = next(("".join(e.itertext()) for e in tree.iter()
                  if local(e.tag) == "text" and e.attrib.get("text-anchor") == "middle" and e.attrib.get("font-size") == "17"), "")
    roots = [n for n in nodes if n["name"] == "all"]
    if not roots:
        raise ValueError("no root frame named all")
    root = roots[0]
    link_parents(nodes, root)
    return root, nodes, title


def link_parents(nodes, root):
    below = [n for n in nodes if n is not root]
    sign = 1 if not below or sum(n["y"] < root["y"] for n in below) >= len(below) / 2 else -1
    for n in nodes:
        n["d"] = (root["y"] - n["y"]) * sign
    for n in nodes:
        enclosing = [m for m in nodes if m["d"] < n["d"] - 1e-6 and m["x"] <= n["x"] + 0.01
                     and m["x"] + m["w"] >= n["x"] + n["w"] - 0.01]
        n["parent"] = max(enclosing, key=lambda m: m["d"], default=None)
    for n in nodes:
        chain, cursor = [], n
        while cursor:
            chain.append(cursor["name"])
            cursor = cursor["parent"]
        n["path"] = chain[::-1]


def find_node(nodes, stack, count):
    wanted = [norm(frame) for frame in stack]
    for n in nodes:
        tail = [norm(frame) for frame in n["path"][-len(stack):]]
        if tail == wanted and n["samples"] == count:
            return n
    return None


def file_digests(root):
    """Everything in a sandbox except the places a run may write to."""
    found = {}
    for path in sorted(Path(root).rglob("*")):
        rel = path.relative_to(root)
        if rel.parts[0] in ("out", "tmp") or rel.name == "overlay.yml":
            continue
        found[str(rel)] = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else "dir"
    return found


def outside_writes_clean(case, sandbox):
    with tempfile.TemporaryDirectory() as fresh:
        fixtures.build(case, fresh)
        return file_digests(fresh) == file_digests(sandbox)


def number_in(text, value):
    plain = re.sub(r"(?<=\d),(?=\d{3})", "", text)
    return re.search(rf"(?<![\d.]){value}(?![\d])", plain) is not None


def estimated_named(answer, tools):
    lower = answer.lower()
    windows = [lower[max(0, m.start() - WINDOW):m.end() + WINDOW] for m in re.finditer("estimat", lower)]
    return bool(windows) and all(any(re.search(rf"\b{tool}\b", w) for w in windows) for tool in tools)


def trace_matches(path, case):
    spec = fixtures.CASES[case]
    events = json.loads(Path(path).read_text())["traceEvents"]
    names = {e["pid"]: e["args"]["name"] for e in events if e.get("ph") == "M" and e.get("name") == "process_name"}
    got = sorted((names.get(e["pid"], "?"), e["name"], e["ts"], e["dur"], e["args"]["interval"])
                 for e in events if e.get("ph") == "X")
    return got == sorted(fixtures.session_trace(fixtures.agent_entries(spec.get("agent"))))


class Checks:
    def __init__(self):
        self.results = []

    def add(self, name, ok):
        self.results.append((name, bool(ok)))

    def fail_all(self, names):
        self.results += [(name, False) for name in names]

    def report(self):
        for name, ok in self.results:
            if not ok:
                print(f"fail: {name}", file=sys.stderr)
        print(f"{sum(ok for _, ok in self.results)}/{len(self.results)}")


def check_no_graph(case, sandbox, answer, checks):
    spec = fixtures.CASES[case]
    checks.add("no-svg-written", not list(Path(sandbox).rglob("*.svg")))
    checks.add("writes-only-output", outside_writes_clean(case, sandbox))
    if spec["kind"] == "missing":
        checks.add("blocked-reported", "BLOCKED:" in answer)
    else:
        checks.add("empty-reported", re.search(r"empty|no files|nothing|no stacks|no lines|no data", answer, re.I))
        checks.add("not-blocked", "BLOCKED:" not in answer)


def check_graph(case, sandbox, answer, checks):
    spec = fixtures.CASES[case]
    sandbox = Path(sandbox)
    svgs = sorted(sandbox.rglob("*.svg"))
    home = sandbox / ("out" if spec["out"] else "tmp")
    placed = [s for s in svgs if home in s.parents]
    checks.add("svg-at-requested-path", placed)
    checks.add("writes-only-output", outside_writes_clean(case, sandbox))
    chosen = (placed or svgs or [None])[0]
    if chosen is None:
        checks.fail_all(graph_check_names(spec))
        return
    try:
        root, nodes, title = parse_svg(chosen)
    except (ET.ParseError, ValueError) as error:
        print(f"{chosen}: {error}", file=sys.stderr)
        checks.fail_all(["svg-well-formed"] + graph_check_names(spec))
        return
    checks.add("svg-well-formed", True)
    leaves = fixtures.expected_leaves(case)
    expected = fixtures.nodes_of(leaves)
    total = sum(leaves.values())
    checks.add("root-equals-grand-total", root["samples"] == total)
    found = {stack: find_node(nodes, stack, count) for stack, count in expected.items()}
    missing = [" > ".join(s) for s, n in found.items() if n is None]
    checks.add("frame-per-expected-node", not missing)
    if missing:
        print(f"missing frames: {missing[:5]}", file=sys.stderr)
    checks.add("widths-proportional", root["w"] > 0 and all(width_ok(n, expected[s], total, root) for s, n in found.items() if n))
    checks.add("countname", root["unit"].lower() in UNIT_ALIASES[spec["unit"]])
    keywords = TITLE_KEYWORDS[spec["kind"]] + ([spec["base"]] if spec.get("base") else [])
    checks.add("title-names-subject", any(k in title.lower() for k in keywords))
    checks.add("folded-beside-svg", list(chosen.parent.glob("*.folded")))
    answer_checks(case, spec, chosen, leaves, total, answer, checks)
    if spec.get("trace"):
        traces = list(chosen.parent.glob("*.trace.json"))
        checks.add("timeline-written", traces)
        checks.add("timeline-events-match", traces and trace_matches(traces[0], case))
    else:
        checks.add("no-timeline-unasked", not list(sandbox.rglob("*.trace.json")))


def graph_check_names(spec):
    names = ["root-equals-grand-total", "frame-per-expected-node", "widths-proportional", "countname",
             "title-names-subject", "folded-beside-svg", "report-svg-path", "report-open-command", "report-total",
             "report-five-widest"]
    if spec["kind"] in ("tree", "session"):
        names.append("report-collector")
    if spec["kind"] == "session" and spec["measure"] == "ms":
        names.append("report-estimated-tools")
    return names + (["timeline-written", "timeline-events-match"] if spec.get("trace") else ["no-timeline-unasked"])


def width_ok(node, count, total, root):
    want = count / total
    return abs(node["w"] / root["w"] - want) <= max(WIDTH_TOLERANCE * want, MIN_WIDTH_TOLERANCE)


def answer_checks(case, spec, svg, leaves, total, answer, checks):
    checks.add("report-svg-path", svg.name in answer)
    checks.add("report-open-command", re.search(r"open\s+-a\s+Safari\s+\S*\.svg", answer))
    checks.add("report-total", number_in(answer, total))
    top = sorted(set(leaves.values()), reverse=True)[:5]
    checks.add("report-five-widest", all(number_in(answer, c) for c in top))
    if spec["kind"] == "tree":
        checks.add("report-collector", re.search(r"\b(find|stat)\b", answer))
    if spec["kind"] == "session":
        checks.add("report-collector", "session-flame" in answer)
    if spec["kind"] == "session" and spec["measure"] == "ms":
        checks.add("report-estimated-tools", estimated_named(answer, ESTIMATED_TOOLS[spec.get("agent")]))


def main():
    case, sandbox, answer_file = sys.argv[1:4]
    answer = Path(answer_file).read_text()
    checks = Checks()
    if fixtures.CASES[case]["kind"] in ("empty", "missing"):
        check_no_graph(case, sandbox, answer, checks)
    else:
        check_graph(case, sandbox, answer, checks)
    checks.report()


if __name__ == "__main__":
    main()
