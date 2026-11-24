"""Validity of one ponytail-compat coding run, shared by the SkillOpt env and the shell refill.

A run is valid when check output exists, the transcript is one uninterleaved run, and the last turn stopped normally from the
expected model. Anything else (abort, timeout, fallback model, empty output, spliced transcript) is missing data.

Usage: python3 validity.py <run tag> <expected model>; exit 0 when valid.
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

SMALL = Path(__file__).resolve().parents[1] / "small"
sys.path.insert(0, str(SMALL))
import score as small_score  # noqa: E402

STOP_REASON = re.compile(r'"stopReason":"(\w+)"')


def run_is_valid(tag, expected):
    parts = Path(f"{tag}.parts")
    transcript = Path(f"{tag}.jsonl")
    if not parts.exists() or not parts.read_text().strip() or not transcript.exists():
        return False
    _cost, _calls, _errors, responders, _answer = small_score.read_run(f"{tag}.jsonl")
    stop_reasons = STOP_REASON.findall(transcript.read_text())
    return (
        responders == {expected}
        and stop_reasons[-1:] == ["stop"]
        and transcript_is_whole(transcript)
    )


def transcript_is_whole(path):
    sessions = set()
    starts = 0
    ends = []
    streamed = []
    for line in Path(path).read_text(encoding="utf8").splitlines():
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            return False
        kind = event.get("type")
        if kind == "session":
            sessions.add(event.get("id"))
        elif kind == "agent_start":
            starts += 1
        elif kind == "agent_end":
            ends.append(event.get("messages", []))
        elif kind == "message_end":
            streamed.append(message_key(event.get("message", {})))
    if len(sessions) != 1 or starts != 1 or len(ends) != 1:
        return False
    final = Counter(message_key(message) for message in ends[0])
    return Counter(streamed) == final


def message_key(message):
    return (message.get("role"), message.get("timestamp"))


if __name__ == "__main__":
    sys.exit(0 if run_is_valid(sys.argv[1], sys.argv[2]) else 1)
