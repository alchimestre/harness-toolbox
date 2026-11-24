"""SkillOpt environment whose skill is the code-rule body.

A rollout runs bench/code-rule/run.sh on a fixture with the candidate rules appended to the system prompt.
Hard passes only when the visible test, every hidden check, and every static check pass. Soft is the mean of
the hidden and static fractions. Splits are by case id, not fixture kind, because held-out cases reuse fixtures.
"""

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import jev_gate

BENCH = Path(__file__).resolve().parents[1] / "code-rule"
SMALL = jev_gate.SMALL
sys.path.insert(0, str(SMALL))
import score as small_score  # noqa: E402

RUN = BENCH / "run.sh"
MODEL = "anthropic/claude-haiku-5-5:high"
WORKERS = 16
ATTEMPTS = 3
SPLITS = {
    "train": ("pricing", "parser", "refactor-urgent", "config-terse", "vendor-urgent"),
    "val": ("pricing-urgent", "parser-terse", "refactor", "config", "vendor"),
}


def build_items(reps):
    """One item per case and repetition; the agent is stochastic, so repetitions are separate samples."""
    items = []
    for split, cases in SPLITS.items():
        for case in cases:
            for rep in range(1, reps + 1):
                items.append({"id": f"{case}-{rep}", "case": case, "rep": rep, "split": split,
                              "task_type": case.split("-")[0], "question": assignment(case)})
    return items


def assignment(case):
    return (BENCH / "prompts" / f"{case}.txt").read_text().strip()


class CodeRuleAdapter(jev_gate.JevGateAdapter):
    """Reuses the gate adapter's split loading; only the rollout differs."""

    def rollout(self, env_manager, skill_content, out_dir, **kwargs):
        out = Path(out_dir).resolve()
        out.mkdir(parents=True, exist_ok=True)
        rules_file = out / "rules.md"
        rules_file.write_text(skill_content)
        with ThreadPoolExecutor(WORKERS) as pool:
            results = list(pool.map(lambda item: run_and_score(item, rules_file, skill_content, out), env_manager))
        (out / "rollouts.json").write_text(json.dumps(results, indent=2))
        return results


def run_and_score(item, rules_file, skill, out_dir):
    item_dir = out_dir / "predictions" / item["id"]
    item_dir.mkdir(parents=True, exist_ok=True)
    tag = item_dir / "run"
    run_case(item, rules_file, tag)
    _cost, _calls, _errors, _responders, answer = small_score.read_run(f"{tag}.jsonl")
    passed = Path(f"{tag}.result").read_text().strip() == "pass"
    hidden = fraction(Path(f"{tag}.parts"))
    static = fraction(Path(f"{tag}.static"))
    raw = (hidden + static) / 2
    feedback = describe(tag, passed, hidden, static)
    return result(item, skill, item_dir, answer, int(passed), raw, feedback)


def fraction(path):
    """A scorer that prints nothing or a non-'passed/total' line scores 0, not a fallback; a crash must not pass."""
    text = path.read_text().strip() if path.exists() else ""
    try:
        checked, total = text.split("/")
        return int(checked) / int(total)
    except ValueError:
        return 0.0


def run_case(item, rules_file, tag):
    """A timeout, omp error or fallback model is API noise, so retry rather than train on it."""
    env = {**os.environ, "RUN_TAG": str(tag), "AGENT_PROMPT": str(rules_file)}
    command = [str(RUN), item["case"], MODEL, str(item["rep"])]
    expected = MODEL.split(":")[0]
    responders = set()
    status = None
    for _attempt in range(ATTEMPTS):
        status = subprocess.run(command, env=env)
        if status.returncode != 0:
            continue
        _cost, _calls, _errors, responders, _answer = small_score.read_run(f"{tag}.jsonl")
        if responders == {expected}:
            return
    stderr = Path(f"{tag}.err").read_text()[-1000:]
    raise RuntimeError(f"{item['id']}: run failed {ATTEMPTS} times (exit {status.returncode}, "
                       f"answered by {responders}): {stderr}")


def describe(tag, passed, hidden, static):
    feedback = f"Overall: {'pass' if passed else 'fail'}. Hidden checks {hidden:.0%}; static checks {static:.0%}."
    for name in ("fails", "static_fails"):
        path = Path(f"{tag}.{name}")
        if path.exists() and path.read_text().strip():
            feedback += f"\n{name}:\n" + path.read_text().strip()
    return feedback


def result(item, skill, item_dir, answer, hard, raw, feedback):
    conversation = [
        {"role": "system", "content": skill},
        {"role": "user", "content": item["question"]},
        {"role": "assistant", "content": answer},
        {"role": "user", "content": f"Grader: {feedback}"},
    ]
    (item_dir / "conversation.json").write_text(json.dumps(conversation, ensure_ascii=False, indent=2))
    return {"id": item["id"], "hard": hard, "soft": raw, "raw_reward": raw, "predicted_answer": answer[-2000:],
            "task_type": item["task_type"], "question": item["question"], "fail_reason": "" if hard else feedback,
            "target_system_prompt": skill, "target_user_prompt": item["question"], "n_turns": 1}
