"""SkillOpt environment whose skill is jev-effort-gate's Jev questions.

A rollout asks Jev the candidate questions for each bench/small case, lets chooseLevel pick
an effort, and scores the pick against the recorded Haiku pass rates at low, medium and high.
No coding agent runs during training; the recorded runs are the reward.
"""

import json
import os
import re
import subprocess
import statistics
import sys
from pathlib import Path

from skillopt.datasets.base import SplitDataLoader
from skillopt.envs.base import EnvAdapter
from skillopt.model import claude_backend

SMALL = Path(__file__).resolve().parents[1] / "small"
OVERLAY = SMALL.parent / "overlay.yml"
SCHEDULER = SMALL.parents[1] / "src" / "subagent-scheduler.pl"
SIGNALS = ("exhaustive", "exact", "urgent")
LEVELS = ("low", "medium", "high")
# Utility = pass rate − COST_WEIGHT × the level's pooled cost relative to high: 10% cheaper is worth 1 pp.
# Cost is pooled across cases; per-case cost from six runs is noise that would decide every tie.
COST_WEIGHT = 0.1
JEV_ATTEMPTS = 3
SECTION = re.compile(r"^## (\w+)[ \t]*$", re.MULTILINE)


def build_items():
    """One item per bench/small case that has runs at every level."""
    saved_cwd = os.getcwd()
    # replay.py and score.py resolve run files relative to bench/small.
    sys.path.insert(0, str(SMALL))
    os.chdir(SMALL)
    try:
        import replay

        all_cases = replay.cases()
        table = replay.outcomes(all_cases)
        items = []
        cost = {level: statistics.mean(r[1] for case in all_cases for r in table[case, level]) for level in LEVELS}
        for case, (kind, prefix, prompt_file) in all_cases.items():
            if not all(table[case, level] for level in LEVELS):
                continue
            runs = {level: table[case, level] for level in LEVELS}
            items.append({
                "id": case,
                "task_type": kind,
                "agent": replay.AGENT_FOR_KIND[kind],
                "prompt": replay.prompt_of(prefix, prompt_file),
                "pass_rate": {level: sum(r[0] for r in rs) / len(rs) for level, rs in runs.items()},
                "runs": {level: len(rs) for level, rs in runs.items()},
                "cost": {level: cost[level] / cost["high"] for level in LEVELS},
            })
        return items
    finally:
        os.chdir(saved_cwd)


def parse_questions(skill):
    parts = SECTION.split(skill)
    bodies = {name: body.strip() for name, body in zip(parts[1::2], parts[2::2])}
    missing = [name for name in SIGNALS if not bodies.get(name)]
    if missing:
        raise ValueError(f"skill lacks a non-empty '## {missing[0]}' section")
    return {name: {"type": "noul", "instructions": bodies[name]} for name in SIGNALS}


class JevGateAdapter(EnvAdapter):
    def __init__(self, split_dir="", data_path="", split_mode="ratio", split_ratio="2:1:1", split_seed=42,
                 split_output_dir="", seed=42, analyst_workers=4, failure_only=False,
                 minibatch_size=8, edit_budget=4):
        self.analyst_workers = analyst_workers
        self.failure_only = failure_only
        self.minibatch_size = minibatch_size
        self.edit_budget = edit_budget
        self.dataloader = SplitDataLoader(split_dir=split_dir, data_path=data_path, split_mode=split_mode,
                                          split_ratio=split_ratio, split_seed=split_seed,
                                          split_output_dir=split_output_dir, seed=seed)

    def setup(self, cfg):
        super().setup(cfg)
        self.dataloader.setup(cfg)

    def get_dataloader(self):
        return self.dataloader

    def build_train_env(self, batch_size, seed, **kwargs):
        return list(self.dataloader.build_train_batch(batch_size=batch_size, seed=seed, **kwargs).payload or [])

    def build_eval_env(self, env_num, split, seed, **kwargs):
        return list(self.dataloader.build_eval_batch(env_num=env_num, split=split, seed=seed, **kwargs).payload or [])

    def get_task_types(self):
        return sorted({item["task_type"] for split in ("train", "val", "test")
                       for item in self.dataloader._splits.get(split, [])})

    def rollout(self, env_manager, skill_content, out_dir, **kwargs):
        items = env_manager
        try:
            picks = gate_picks(items, parse_questions(skill_content), Path(out_dir))
        except ValueError as error:
            picks = {item["id"]: {"error": str(error)} for item in items}
        results = [score(item, picks[item["id"]], skill_content, Path(out_dir)) for item in items]
        Path(out_dir, "rollouts.json").write_text(json.dumps(results, indent=2))
        return results


def gate_picks(items, questions, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    questions_path = out_dir / "questions.json"
    questions_path.write_text(json.dumps(questions, indent=2))
    cases = {item["id"]: {"agent": item["agent"], "prompt": item["prompt"]} for item in items}
    picks = {}
    # A Jev timeout makes chooseLevel fall back to medium; grading that would train on API noise.
    for _attempt in range(JEV_ATTEMPTS):
        output = subprocess.run(["bun", "gate-picks.ts", str(questions_path)], cwd=SMALL, input=json.dumps(cases),
                                capture_output=True, text=True, check=True, timeout=120)
        picks |= json.loads(output.stdout)
        cases = {case: cases[case] for case in cases if picks[case].get("error")}
        if not cases:
            return picks
    raise RuntimeError(f"Jev failed for {sorted(cases)}: {picks[next(iter(cases))]['error']}")


def score(item, pick, skill, out_dir):
    rates = item["pass_rate"]
    level = pick.get("level")
    utility = {name: rates[name] - COST_WEIGHT * item["cost"][name] for name in LEVELS}
    right = max(LEVELS, key=utility.get)
    hard = int(level == right)
    observed = ", ".join(f"{name} {rates[name]:.0%} of {item['runs'][name]} runs" for name in LEVELS)
    if level is None:
        verdict = f"No level chosen: {pick.get('error')}."
    else:
        verdict = (f"Jev signals {json.dumps(pick.get('signals'))}; jevError {pick.get('error')}. "
                   f"Gate picked {level} ({pick['reason']}).")
    feedback = (f"{verdict}\nMeasured Haiku pass rate per effort: {observed}. "
                f"Right pick: {right}, the level with the best pass rate after a cost penalty "
                f"of {COST_WEIGHT * 100:.0f} pp per run that costs as much as high.")
    task_dir = out_dir / "predictions" / item["id"]
    task_dir.mkdir(parents=True, exist_ok=True)
    conversation = [
        {"role": "system", "content": skill},
        {"role": "user", "content": f"Agent: {item['agent']}\nAssignment:\n{item['prompt']}"},
        {"role": "assistant", "content": feedback},
    ]
    (task_dir / "conversation.json").write_text(json.dumps(conversation, ensure_ascii=False, indent=2))
    return {"id": item["id"], "hard": hard, "soft": rates[level] if level else 0.0, "predicted_answer": level or "",
            "task_type": item["task_type"], "question": item["prompt"], "fail_reason": "" if hard else feedback,
            "target_system_prompt": skill, "target_user_prompt": item["prompt"], "n_turns": 1}


def run_omp_print(*, system, prompt, model, tools, tool_choice, return_message, timeout, attachments=None):
    """Drop-in for claude_backend._run_claude_print: one subscription-billed omp call per optimizer step."""
    if tools or tool_choice or return_message or attachments:
        raise RuntimeError("the omp optimizer handles plain text calls only")
    thinking = claude_backend.REASONING_EFFORT or "low"
    # The timeout sits inside the scheduler so time spent queued for a slot never counts against the call.
    args = ["perl", str(SCHEDULER), "timeout", str(timeout or 300), "omp", "-p", "--mode", "json", "--no-session",
            "--no-tools", "--no-extensions", "--no-skills",
            "--no-context-files", "--no-rules", "--no-title", "--config", str(OVERLAY),
            "--model", model, "--thinking", thinking, "--system-prompt", system, prompt]
    output = subprocess.run(args, capture_output=True, text=True)
    if output.returncode != 0:
        raise RuntimeError(output.stderr.strip()[-2000:] or f"omp exited with {output.returncode}")
    events = [json.loads(line) for line in output.stdout.splitlines() if line.startswith("{")]
    message = next(event["message"] for event in reversed(events) if event.get("type") == "turn_end")
    if f"{message.get('provider')}/{message.get('model')}" != model:
        raise RuntimeError(f"answered by {message.get('provider')}/{message.get('model')}, not {model}")
    text = "".join(part.get("text", "") for part in message["content"] if part.get("type") == "text")
    usage = message.get("usage", {})
    prompt_tokens = usage.get("input", 0) + usage.get("cacheRead", 0) + usage.get("cacheWrite", 0)
    tokens = {"prompt_tokens": prompt_tokens, "completion_tokens": usage.get("output", 0),
              "total_tokens": prompt_tokens + usage.get("output", 0)}
    return text, {"type": "result", "result": text}, tokens
