"""Self-test: a correct hand-made run passes every case's checks, and a double-counted one fails.

usage: selftest.py   (needs flamegraph.pl and bun on PATH; TOOLBOX=<repo root> for the session script)
"""
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import fixtures

TOOLBOX = Path(os.environ.get("TOOLBOX", Path(__file__).resolve().parents[2]))


def render(folded_lines, out, name, unit, title):
    folded = out / f"{name}.folded"
    folded.write_text("\n".join(folded_lines) + "\n")
    svg = out / f"{name}.svg"
    svg.write_text(subprocess.run(["flamegraph.pl", "--title", title, "--countname", unit, str(folded)],
                                  capture_output=True, text=True, check=True).stdout)
    return svg


def stacks(leaves, double_count=False):
    lines = [f"{';'.join(f.replace(';', ',') for f in stack)} {count}" for stack, count in leaves.items()]
    if double_count:
        lines.append(f"{';'.join(next(iter(leaves))[:1])} {sum(leaves.values())}")
    return lines


def solve(case, root, out, double_count=False):
    spec = fixtures.CASES[case]
    leaves = fixtures.expected_leaves(case)
    if spec["kind"] in ("empty", "missing"):
        return "BLOCKED: nothing to draw" if spec["kind"] == "missing" else "The directory is empty: no files."
    unit = {"microusd": "microUSD"}.get(spec["unit"], spec["unit"])
    subject = {"tree": "proj", "timing": "times.json"}.get(spec["kind"], "Billing refactor")
    svg = render(stacks(leaves, double_count), out, "graph", unit, f"{subject}: {unit}")
    if spec.get("trace"):
        transcript = root / "sessions" / f"{fixtures.SESSION_STEM}.jsonl"
        trace = subprocess.run(["bun", str(TOOLBOX / "src/session-flame.ts"), str(transcript), "trace"],
                               capture_output=True, text=True, check=True).stdout
        (out / "graph.trace.json").write_text(trace)
    top = sorted(leaves.values(), reverse=True)[:5]
    collector = "session-flame.ts" if spec["kind"] == "session" else "find proj -type f"
    estimated = "Estimated tools: read, grep, task." if spec.get("measure") == "ms" else ""
    return (f"{svg} graph.folded. open -a Safari {svg}\nCollector: {collector}\n"
            f"Total {sum(leaves.values())} {unit}. Widest: {top}. {estimated}")


def run_check(case, double_count=False):
    with tempfile.TemporaryDirectory() as raw:
        root = Path(raw).resolve()
        fixtures.build(case, root)
        (root / "tmp").mkdir()
        out = root / "out" if fixtures.CASES[case]["out"] else Path(tempfile.mkdtemp(dir=root / "tmp"))
        answer = Path(raw + ".answer.txt")
        answer.write_text(solve(case, root, out, double_count))
        done = subprocess.run([sys.executable, "check.py", case, str(root), str(answer)], capture_output=True, text=True)
        answer.unlink()
        return done.stdout.strip().splitlines()[-1], done.stderr.strip()


if __name__ == "__main__":
    bad = 0
    for case in fixtures.CASES:
        parts, errors = run_check(case)
        good = parts.split("/")[0] == parts.split("/")[1]
        bad += not good
        print(f"{case}: {parts} {'ok' if good else 'FAIL ' + errors}")
    parts, _ = run_check("tree-pointed", double_count=True)
    caught = parts.split("/")[0] != parts.split("/")[1]
    print(f"double-counted subtotal caught: {caught}")
    sys.exit(bad or not caught)
