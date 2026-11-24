#!/usr/bin/env python3
"""usage: check.py <ticket|readme|runbook|resolution|map> <dir> [case]

Scores the artifact the agent wrote into <dir> against the limits in rules/writing.md.
Last stdout line: passed/total. stderr: one `fail: <name>` per failed check. Exit 0 only when all pass.
"""
import re
import sys
from pathlib import Path

OUTPUT = {"ticket": "ticket.md", "readme": "README.md", "runbook": "runbook.md", "resolution": "comment.md", "map": "line.md"}
GROUNDED = {
    "ticket": r"10,?000|truncat|silent|drop",
    "readme": r"--age",
    "runbook": r"pg_stat_replication|replay_lag",
    "resolution": r"cursor",
    "map": r"retr(y|ies)|webhook",
    "ticket-f1": r"BOM|byte order|skip|drop|silent|missing",
    "resolution-f1": r"purge|ttl",
    "readme-f1": r"--key|dedupe",
}
VERBS = set("""add allow apply avoid block build bump capture change check clean close collapse configure convert correct count create cut
deduplicate default define deliver deprecate detect disable document drop eliminate emit enable ensure error exit expire export expose
extend fail fetch finish fix flag flush forbid format guard handle harden honor implement improve include increase keep limit list
load log make mark merge migrate move normalize notify omit open pass paginate parse persist prevent print process propagate prune
publish purge raise read record reduce refuse reject release remove rename reorder replace report require reset resolve respect
restore retry return reuse revert review roll route run sanitize save send serve set show skip split stop store stream support surface
switch sync take throw time trim truncate try unblock update upgrade use validate verify warn wire write""".split())

ID = re.compile(r"\b(?!(?:UTF|SHA|ISO|HTTP)-)[A-Z][A-Z0-9]{1,9}-\d+\b|(?<![\w&])#\d+\b")
JIRA = re.compile(r"\bjira\b", re.I)
HISTORY = re.compile(r"""\b(
  previously|originally|formerly|historically|no\ longer|ago|at\ first|back\ then|over\ time|in\ the\ (past|beginning)
  |used\ to\ (be|work|have|return|do|default|run|take|read|write|print|fail|crash|stream|load)
  |(was|were|has\ been|have\ been)\ (changed|introduced|added|removed|fixed|migrated|refactored|rewritten|renamed|replaced|deprecated|shipped|released|reported|closed|filed)
  |we\ (tried|discovered|rewrote|migrated|switched|noticed|debated|discussed|shipped|considered)
  |(started|began)\ (as|out)|(last|this\ past)\ (week|month|quarter|year)
  |after\ (a|the|that)\ (long\ )?(migration|refactor|rewrite|upgrade|incident|outage|discussion|debate|review|meeting)
  |(since|in|before|after|from|prior\ to|until|as\ of)\ (v\d|version\ ?\d)
  |(argued|objected|withdrew|proposed|voted|pushed\ back|weighed\ in)
  |(old|previous|former|legacy|earlier)\ (behaviou?r|version|implementation|default|approach|design)
  |\d{4}-\d\d-\d\d|(in|since|during|by)\ (19|20)\d\d
  |(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\ (19|20)\d\d
)\b""", re.I | re.X)
RATIONALE = re.compile(r"\b(because|the\ reason|in\ order\ to|so\ that|don'?t\ worry|do\ not\ worry|rest\ assured|no\ need\ to\ (worry|panic)|this\ is\ (normal|safe|harmless|fine|usually)|usually\ harmless|why)\b", re.I | re.X)
SECTION = re.compile(r"^[#\s*_>-]*(why this matters|why it matters|context|background|notes?|history|motivation)(\s*[:*_]+|\s*$)", re.I)
TRACKER = re.compile(r"^[#\s*_>-]*(type|status|assignee)\s*[:*_]+", re.I)
ITEM = re.compile(r"^\s*([-*+]|\d+[.)])\s+(\[[ xX]\]\s*)?(.*)")
ACCEPTANCE = re.compile(r"^[#\s*_>-]*acceptance(\s+criteria)?\s*[:*_]*\s*$", re.I)
PROSE_WORDS = 20


def words(text):
    return len(re.findall(r"\d+(?:,\d{3})+|\w[\w'’./:-]*", text))


def sentences(text):
    return len(re.findall(r"[.!?](\s|$)", text.strip()))


def is_heading(line):
    return line.lstrip().startswith("#")


def title_of(lines):
    first = next((line for line in lines if line.strip()), "")
    return re.sub(r"^(title\s*:\s*)", "", re.sub(r"^[#\s*_`>-]+|[*_`\s]+$", "", first), flags=re.I)


def split_acceptance(lines):
    """Returns (body lines, acceptance item lines); a missing section yields no items."""
    body, items, inside = [], [], False
    for line in lines:
        if ACCEPTANCE.match(line):
            inside = True
        elif inside and is_heading(line):
            inside = False
            body.append(line)
        elif inside:
            if line.strip():
                items.append(ITEM.sub(r"\3", line).strip())
        else:
            body.append(line)
    return body, items


def prose_paragraphs(lines):
    """Returns (intro text, prose paragraph texts); the intro runs until the first structure (non-H1 heading, list, table, code)."""
    intro, prose, paragraph, in_fence, in_intro, in_item = [], [], [], False, True, False
    def flush():
        if paragraph:
            (intro if in_intro else prose).append(" ".join(paragraph))
            paragraph.clear()
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            flush(); in_fence = not in_fence; in_intro = False
        elif in_fence:
            continue
        elif not stripped:
            flush(); in_item = False
        elif is_heading(line):
            flush()
            in_item = False
            if not re.match(r"^\s*#\s", line):
                in_intro = False
        elif ITEM.match(line) or stripped.startswith("|"):
            flush(); in_intro = False; in_item = True
        elif in_item and line.startswith("  "):
            continue
        else:
            paragraph.append(stripped)
    flush()
    return " ".join(intro), prose


def common(text, lines, checks, rationale):
    checks["no_forbidden_sections"] = not any(SECTION.match(line) for line in lines)
    checks["no_ticket_ids"] = not ID.search(text) and not JIRA.search(text)
    checks["no_history"] = not HISTORY.search(text)
    if rationale:
        checks["no_rationale"] = not RATIONALE.search(text)


def check_ticket(text, lines, checks):
    title = title_of(lines)
    checks["title_verb_first"] = bool(title) and re.sub(r"\W", "", title.split()[0]).lower() in VERBS
    checks["title_words"] = 0 < words(title) <= 8
    rest = lines[lines.index(next(line for line in lines if line.strip())) + 1:]
    body, items = split_acceptance(rest)
    checks["body_words"] = words(" ".join(line for line in body if not is_heading(line))) <= 60
    checks["ac_count"] = len(items) <= 5
    checks["ac_item_words"] = all(words(item) <= 10 for item in items)
    checks["no_tracker_state"] = not any(TRACKER.match(line) for line in lines)
    common(text, lines, checks, rationale=False)


def check_readme(text, lines, checks):
    intro, prose = prose_paragraphs(lines)
    checks["intro_two_sentences"] = 1 <= sentences(intro) <= 2
    checks["no_prose_paragraph"] = all(words(paragraph) <= PROSE_WORDS for paragraph in prose)
    checks["has_table"] = any(re.match(r"^\s*\|\s*:?-{3,}", line) for line in lines)
    checks["has_code_block"] = "```" in text
    common(text, lines, checks, rationale=True)


def check_runbook(text, lines, checks):
    intro, prose = prose_paragraphs(lines)
    checks["intro_two_sentences"] = sentences(intro) <= 2
    checks["no_prose_paragraph"] = all(words(paragraph) <= PROSE_WORDS for paragraph in prose)
    checks["numbered_steps"] = sum(bool(re.match(r"^\s*\d+[.)]\s", line)) for line in lines) >= 3
    common(text, lines, checks, rationale=True)


def check_resolution(text, lines, checks):
    checks["words_150"] = words(text) <= 150
    checks["gives_reason"] = bool(re.search(r"skip|shift|duplicat|miss|repeat|insert", text, re.I))
    common(text, lines, checks, rationale=False)


def check_map(text, lines, checks):
    nonempty = [line for line in lines if line.strip()]
    checks["single_line"] = len(nonempty) == 1
    checks["words_20"] = words(text) <= 20
    checks["no_tracker_state"] = not any(TRACKER.match(line) for line in lines) and not re.search(r"\bstatus\b", text, re.I)
    common(text, lines, checks, rationale=False)


CHECKERS = {"ticket": check_ticket, "readme": check_readme, "runbook": check_runbook, "resolution": check_resolution, "map": check_map}


def run(family, directory, key):
    path = Path(directory) / OUTPUT[family]
    text = path.read_text() if path.exists() else ""
    checks = {"file_written": bool(text.strip())}
    if not text.strip():
        for name in ("grounded", *dry_run_names(family)):
            checks[name] = False
        return checks
    checks["grounded"] = bool(re.search(GROUNDED.get(key, GROUNDED[family]), text, re.I))
    CHECKERS[family](text, text.splitlines(), checks)
    return checks


def dry_run_names(family):
    """Check names for an empty artifact: run the checker on a stub so the denominator stays constant."""
    stub = {}
    CHECKERS[family]("x.", ["x."], stub)
    return stub


def main():
    family, directory = sys.argv[1], sys.argv[2]
    key = sys.argv[3] if len(sys.argv) > 3 else family
    checks = run(family, directory, key)
    for name, ok in checks.items():
        if not ok:
            print(f"fail: {name}", file=sys.stderr)
    passed = sum(checks.values())
    print(f"{passed}/{len(checks)}")
    sys.exit(0 if passed == len(checks) else 1)


if __name__ == "__main__":
    main()
