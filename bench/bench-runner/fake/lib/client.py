"""Stand-in model API: answers one cell, with seeded quota errors, wrong-model answers and crashes."""
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

LIB = Path(__file__).resolve().parent
BENCH = LIB.parent
SANDBOX = BENCH.parent
LOG = SANDBOX / ".log" / "invocations.log"
STATE = SANDBOX / ".state"
MODELS = ["acme/alpha-1", "acme/beta-2", "acme/gamma-3"]
FAULT_ROLL_LIMITS = [("quota", 14), ("wrong-once", 22), ("wrong-always", 28), ("crash-once", 34), ("crash-always", 40)]
RESET_SECONDS_MIN = 15
RESET_SECONDS_SPREAD = 16
WORK_SECONDS = 2
ALWAYS_BAD = ("wrong-always", "crash-always")


def digest(seed, case, requested, rep):
    return int(hashlib.sha1(f"{seed}:{case}:{requested}:{rep}".encode()).hexdigest(), 16)


def plan(seed, case, requested, rep):
    roll = digest(seed, case, requested, rep) % 100
    for kind, limit in FAULT_ROLL_LIMITS:
        if roll < limit:
            return kind
    return "ok"


def other_model(requested):
    model, effort = requested.split(":")
    return f"{MODELS[(MODELS.index(model) + 1) % len(MODELS)]}:{effort}"


def make_result(seed, case, requested, rep, answered_by=None):
    h = digest(seed, case, requested, rep)
    result = {"case": case, "rep": rep, "requested": requested, "answered_by": answered_by or requested,
              "score": ((h >> 8) % 1001) / 1000, "secs": 5 + (h >> 20) % 40}
    if answered_by:
        result.update(score=0.999, secs=2)
    return result


def result_path(case, requested, rep):
    return BENCH / "results" / f"{case}__{requested.replace('/', '_')}__{rep}.json"


def log(line):
    LOG.parent.mkdir(exist_ok=True)
    with open(LOG, "a") as handle:
        handle.write(line + "\n")


def main():
    if len(sys.argv) != 4:
        sys.exit("usage: run.sh <case> <provider/model:effort> <rep>")
    case, requested, rep = sys.argv[1], sys.argv[2], int(sys.argv[3])
    seed = (LIB / "seed").read_text().strip()
    kind = plan(seed, case, requested, rep)
    state_file = STATE / f"{case}__{requested.replace('/', '_')}__{rep}.json"
    STATE.mkdir(exist_ok=True)
    state = json.loads(state_file.read_text()) if state_file.exists() else {"calls": 0}
    state["calls"] += 1
    now = int(time.time())
    log(f"RUN {now} {requested} {case} {rep}")
    outcome = answer(kind, state, seed, case, requested, rep, now)
    state_file.write_text(json.dumps(state))
    reset = state["reset"] if outcome == "quota" else "-"
    log(f"END {int(time.time())} {requested} {case} {rep} {outcome} {reset}")
    sys.exit({"quota": 1, "crash": 139}.get(outcome, 0))


def answer(kind, state, seed, case, requested, rep, now):
    path = result_path(case, requested, rep)
    path.parent.mkdir(exist_ok=True)
    if kind == "quota" and now < state.setdefault("reset", now + RESET_SECONDS_MIN + digest(seed, case, requested, rep) % RESET_SECONDS_SPREAD):
        reset = datetime.fromtimestamp(state["reset"], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        print(f"error: 429 quota exhausted for {requested}. Quota resets at {reset}.", file=sys.stderr)
        return "quota"
    time.sleep(WORK_SECONDS)
    first_call = state["calls"] == 1
    if kind == "crash-always" or (kind == "crash-once" and first_call):
        path.write_text('{"case": "' + case)
        print("Segmentation fault: 11", file=sys.stderr)
        return "crash"
    if kind == "wrong-always" or (kind == "wrong-once" and first_call):
        path.write_text(json.dumps(make_result(seed, case, requested, rep, other_model(requested))))
        print(f"ok {path.name}")
        return "wrong"
    path.write_text(json.dumps(make_result(seed, case, requested, rep)))
    print(f"ok {path.name}")
    return "ok"


if __name__ == "__main__":
    main()
