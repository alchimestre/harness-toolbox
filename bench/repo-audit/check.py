"""Mechanical check for one repo-audit run.

usage: check.py <repo-id> <repo dir> <report file> <manifest file> [<detail file>]
       check.py --manifest <repo dir>     prints the repo's content manifest as JSON
       check.py --selftest

A seeded defect or decoy counts as hit by a finding when the finding cites its file within 3 lines of the seeded
span, or quotes the seeded line. Each cited location resolves to the nearest seeded item (a defect wins a tie).
Last stdout line: found/total defects. Failing checks go to stderr as `fail: <name>`.
Hard pass: report written, repo byte-identical, at most one defect missed, no decoy flagged.
Soft score: recall minus 0.25 per decoy flagged (0 when the report is missing or the repo changed).
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
LINE_SLACK = 3
DECOY_PENALTY = 0.25
MAX_MISSED_FOR_HARD = 1
FINDING_START = re.compile(r"^\s*(?:#{1,6}\s+|\*{0,2}\d+[.)]\s|-\s+\[severity)")
TRAILER_START = re.compile(r"^\s*(?:#{1,6}\s*)?\**\s*(commands run|commands|axes skipped|areas not read|not run)\b", re.I)
FILE_TOKEN = re.compile(r"([\w./-]*[\w-]\.(?:js|py|md|json)|Makefile)")
LINE_SPEC = r"(\d+(?:\s*[-–]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-–]\s*\d+)?)*)"
AFTER_FILE = re.compile(r"^(?:[:#]L?|\W{0,3}[Ll]ines?\s*)" + LINE_SPEC)


def manifest(repo):
    files = {}
    for root, dirs, names in os.walk(repo):
        dirs[:] = [name for name in dirs if name != ".git"]
        for name in names:
            path = os.path.join(root, name)
            files[os.path.relpath(path, repo)] = hashlib.sha256(open(path, "rb").read()).hexdigest()
    status = subprocess.run(["git", "status", "--porcelain"], cwd=repo, capture_output=True, text=True).stdout
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True).stdout.strip()
    return {"files": files, "status": status, "head": head}


def split_findings(report):
    blocks = []
    for line in report.splitlines():
        if TRAILER_START.match(line):
            break
        if FINDING_START.match(line) or not blocks:
            blocks.append([line])
        else:
            blocks[-1].append(line)
    return ["\n".join(block) for block in blocks]


def parse_spec(spec):
    spans = []
    for part in re.split(r"\s*,\s*", spec):
        ends = [int(number) for number in re.split(r"\s*[-–]\s*", part)]
        spans.append((ends[0], ends[-1]))
    return spans


def references(block, repo_files):
    refs = []
    for token in FILE_TOKEN.finditer(block):
        name = token.group(1).lstrip("./")
        path = next((f for f in repo_files if name == f or name.endswith("/" + f) or f.endswith("/" + name)), None)
        after = AFTER_FILE.match(block[token.end():token.end() + 40])
        if path and after:
            refs.extend((path, start, end) for start, end in parse_spec(after.group(1)))
    return refs


def squash(text):
    return re.sub(r"\s+", " ", text)


def gap(start, end, loc):
    return max(0, loc["lines"][0] - end, start - loc["lines"][1])


def hits(block, repo_files, truth):
    items = [(kind, name, loc) for kind in ("defects", "decoys") for name, item in truth[kind].items() for loc in item["at"]]
    found = set()
    flat = squash(block)
    for kind, name, loc in items:
        if squash(loc["quote"]) in flat:
            found.add((kind, name))
    for path, start, end in references(block, repo_files):
        near = [(gap(start, end, loc), kind != "defects", name, kind) for kind, name, loc in items if loc["file"] == path]
        near = [entry for entry in near if entry[0] <= LINE_SLACK]
        if near:
            _gap, _is_decoy, name, kind = min(near)
            found.add((kind, name))
    return found


def score(truth, report, repo_files):
    matched = set()
    for block in split_findings(report):
        matched |= hits(block, repo_files, truth)
    defects = sorted(name for kind, name in matched if kind == "defects")
    decoys = sorted(name for kind, name in matched if kind == "decoys")
    return defects, decoys


def check(repo_id, repo, report_path, manifest_path, detail_path=None):
    truth = json.load(open(os.path.join(HERE, "truth", f"{repo_id}.json")))
    total = len(truth["defects"])
    fails = []
    report = open(report_path).read() if os.path.exists(report_path) else ""
    if not report.strip():
        fails.append("no report")
    before = json.load(open(manifest_path))
    if manifest(repo) != before:
        fails.append("repo changed")
    defects, decoys = score(truth, report, sorted(before["files"]))
    fails += [f"missed {name}" for name in truth["defects"] if name not in defects]
    fails += [f"decoy {name}" for name in decoys]
    broken = any(fail in ("no report", "repo changed") for fail in fails)
    reward = 0.0 if broken else len(defects) / total - DECOY_PENALTY * len(decoys)
    hard = not broken and total - len(defects) <= MAX_MISSED_FOR_HARD and not decoys
    if detail_path:
        json.dump({"found": defects, "decoys": decoys, "reward": reward, "hard": hard, "fails": fails}, open(detail_path, "w"))
    for fail in fails:
        print(f"fail: {fail}", file=sys.stderr)
    print(f"{len(defects)}/{total}")
    return hard


def selftest():
    repo_files = {}
    for repo_id in "abcdef":
        truth = json.load(open(os.path.join(HERE, "truth", f"{repo_id}.json")))
        root = os.path.join(HERE, "fixtures", repo_id)
        repo_files[repo_id] = sorted(os.path.relpath(os.path.join(r, n), root) for r, _d, ns in os.walk(root) for n in ns)
        claimed = {}
        for kind in ("defects", "decoys"):
            for name, item in truth[kind].items():
                for loc in item["at"]:
                    lines = open(os.path.join(root, loc["file"])).read().splitlines()
                    start, end = loc["lines"]
                    assert any(squash(loc["quote"]) in squash(line) for line in lines[start - 1:end]), (repo_id, name, loc)
                    for number in range(start, end + 1):
                        assert (loc["file"], number) not in claimed, (repo_id, name, loc, claimed[(loc["file"], number)])
                        claimed[(loc["file"], number)] = name
        cite = lambda kind: "\n".join(
            f"{i}. [severity: low] [axis: x] Title\n   Evidence: {loc['file']}:{loc['lines'][0]} (`{loc['quote']}`)"
            for i, loc in enumerate((loc for item in truth[kind].values() for loc in item["at"][:1]), 1))
        defects, decoys = score(truth, cite("defects"), repo_files[repo_id])
        assert sorted(defects) == sorted(truth["defects"]) and not decoys, (repo_id, defects, decoys)
        defects, decoys = score(truth, cite("decoys"), repo_files[repo_id])
        assert not defects and sorted(decoys) == sorted(truth["decoys"]), (repo_id, defects, decoys)
        assert score(truth, "", repo_files[repo_id]) == ([], [])
        trailer = "Commands run\n" + cite("decoys")
        assert score(truth, cite("defects") + "\n\n" + trailer, repo_files[repo_id])[1] == [], "trailer ignored"
    toy = {"defects": {"d": {"at": [{"file": "src/x.js", "lines": [10, 12], "quote": "unique quote"}]}}, "decoys": {}}
    cited = lambda spec: score(toy, f"1. Title\n   Evidence: x.js{spec}", ["src/x.js"])[0]
    assert cited(":15") and cited(":7") and cited(" lines 14-20") and cited(":1,9")
    assert not cited(":16") and not cited(":6") and not cited("")
    assert score(toy, "1. Title\n   Evidence: elsewhere (unique   quote)", ["src/x.js"])[0] == ["d"]
    with tempfile.TemporaryDirectory() as folder:
        repo = os.path.join(folder, "repo")
        subprocess.run(["cp", "-R", os.path.join(HERE, "fixtures", "a"), repo], check=True)
        git = ["git", "-c", "user.name=bench", "-c", "user.email=bench@example.invalid"]
        subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
        subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
        subprocess.run(git + ["commit", "-qm", "seed"], cwd=repo, check=True)
        before = os.path.join(folder, "before.json")
        json.dump(manifest(repo), open(before, "w"))
        report = os.path.join(folder, "report.md")
        open(report, "w").write("1. Title\n   Evidence: README.md:11\n")
        assert not check("a", repo, report, before)
        open(os.path.join(repo, "README.md"), "a").write("x")
        assert not check("a", repo, report, before)
    print("selftest ok")


if __name__ == "__main__":
    if sys.argv[1] == "--selftest":
        selftest()
    elif sys.argv[1] == "--manifest":
        print(json.dumps(manifest(sys.argv[2])))
    else:
        sys.exit(0 if check(*sys.argv[1:]) else 1)
