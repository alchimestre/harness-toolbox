"""Writes runs/report/index.html from every SkillOpt run under runs/. Rerun to refresh;
the page reloads itself while any run is still training."""

import html
import json
import re
from datetime import datetime
from pathlib import Path

RUNS = Path(__file__).resolve().parent / "runs"
OUT = RUNS / "report" / "index.html"
AXIS_PP = 50
REFRESH_S = 20
SEED_SKILL = Path(__file__).resolve().parent / "seed.md"
CURRENT_ROUND = "Current round"
ROUND_REWARD = {
    "reward-v1": "Right = cheapest level within one run in six of the best pass rate. Taught the gate to pick low; pass rate fell.",
    "reward-v2": "Right = best pass rate minus a cost penalty from each case's own cost. Cost noise decided ties.",
    "cases-16": "Right = best pass rate minus 10 pp × the level's cost relative to high, cost pooled across cases. 16 cases.",
    "cases-22": "Same reward on 22 cases: adds 3 explore and 3 scout wordings. Random split.",
    CURRENT_ROUND: "Same reward, split by fixture: train on tools/task/explore, select on scout, test on the unseen callers fixture.",
}

CSS = """
:root { color-scheme:dark; --ink:#eff4f7; --muted:#a9b9c8; --line:#2d3d4b; --surface:#14212e; --accent:#8eedc7; --loss:#ffb6a1; --grid:#6f8292; font:16px/1.5 system-ui,sans-serif; }
* { box-sizing:border-box; }
body { margin:0; background:radial-gradient(ellipse 75% 25% at 62% 0,#1a3440,transparent),#0e1822; color:var(--ink); }
main { max-width:1080px; margin:auto; padding:clamp(24px,5vw,68px) clamp(16px,4vw,44px) 56px; }
.hero { padding:10px 0 36px; border-bottom:1px solid var(--line); margin-bottom:30px; }
.eyebrow, .metric-name { font:700 11px/1.4 ui-monospace,monospace; text-transform:uppercase; letter-spacing:.15em; color:var(--accent); }
h1,h2,h3,p { margin:0; }
h1 { font-size:clamp(39px,7.2vw,84px); line-height:1.03; letter-spacing:-.065em; margin:15px 0 18px; }
h1 span { color:var(--accent); font-weight:400; }
.deck { max-width:63ch; color:var(--muted); font-size:clamp(15px,2vw,18px); }
.badge { display:inline-block; margin-top:20px; padding:5px 11px; border:1px solid #39645e; border-radius:999px; color:var(--accent); font:700 11px/1.4 ui-monospace,monospace; letter-spacing:.06em; }
.legend { display:flex; gap:9px 22px; flex-wrap:wrap; color:var(--muted); font-size:13px; margin-bottom:20px; }
.legend b { color:var(--ink); }
.panel { margin:0 0 18px; padding:clamp(13px,2.5vw,26px); border:1px solid var(--line); border-radius:17px; background:var(--surface); }
.panel header { margin-bottom:17px; }
h2 { font-size:clamp(22px,3vw,29px); letter-spacing:-.035em; margin:4px 0 3px; }
.panel p, footer { color:var(--muted); font-size:13px; }
ol { list-style:none; padding:0; margin:0; }
.result, .axis { display:grid; grid-template-columns:minmax(11.5rem,1fr) minmax(0,2.15fr); gap:16px; }
.result { padding:12px 0; border-top:1px solid var(--line); align-items:center; }
h3 { font-size:14px; line-height:1.3; margin-bottom:3px; }
.metrics { display:grid; gap:8px; }
.metric, .axis { --slots:5.1rem minmax(0,1fr) 6.3rem 4.1rem; }
.metric { display:grid; grid-template-columns:var(--slots); align-items:center; gap:9px; }
.metric-name { font-size:10px; color:var(--muted); }
.axis { color:var(--muted); font:10px/1 ui-monospace,monospace; padding-bottom:10px; }
.axis span { grid-column:2; grid-row:1; margin:0 calc(6.3rem + 4.1rem + 18px) 0 calc(5.1rem + 9px); }
.axis span:nth-child(2) { text-align:center; }
.axis span:last-child { text-align:right; }
.track { height:15px; position:relative; border-radius:4px; border-inline:1px solid var(--line); background:linear-gradient(90deg,transparent calc(50% - .5px),var(--grid) calc(50% - .5px),var(--grid) calc(50% + .5px),transparent calc(50% + .5px)); }
.track i { position:absolute; left:var(--start); width:calc(max(50%,var(--end)) - var(--start)); top:5px; height:5px; border-radius:4px; background:currentColor; }
.track i::after { content:""; position:absolute; top:-2px; width:9px; height:9px; border-radius:50%; background:currentColor; right:-4px; }
.down .track i::after { left:-4px; }
.flat .track i::after { width:6px; height:6px; top:0; right:-3px; }
.up { color:var(--accent); } .down { color:var(--loss); } .flat { color:var(--muted); }
.scores, .delta { font:12px/1.35 ui-monospace,monospace; text-align:right; white-space:nowrap; }
.delta { font-weight:700; } .delta small { font-size:10px; }
details { margin-top:14px; } summary { cursor:pointer; font-weight:650; font-size:13px; }
pre { white-space:pre-wrap; font:12px/1.5 ui-monospace,monospace; color:var(--muted); border-left:2px solid var(--line); padding-left:12px; }
footer { margin-top:22px; max-width:85ch; } footer p + p { margin-top:8px; }
@media(max-width:680px) { .result { display:block; } .axis { grid-template-columns:0 minmax(0,1fr); gap:0; } }
"""


def main():
    paths = sorted(path.parent for path in RUNS.glob("**/history.json"))
    runs = [load_run(path) for path in paths]
    live = any(not run["done"] for run in runs)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page(runs, live))
    print(f"{OUT}: {len(runs)} runs, {'live' if live else 'all finished'}")


def load_run(path):
    summary = read_json(path / "summary.json")
    return {
        "name": path.name,
        "round": path.parent.name if path.parent != RUNS else CURRENT_ROUND,
        "done": summary is not None,
        "summary": summary or {},
        "history": read_json(path / "history.json") or [],
        "baseline": read_json(path / "selection_eval_baseline" / "rollouts.json") or [],
        "test_size": len(read_json(path / "test_eval_baseline" / "rollouts.json") or []),
        "best_skill": read_text(path / "best_skill.md"),
        "error": tail_error(path.with_suffix(".log")),
    }


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None


def read_text(path):
    try:
        return path.read_text()
    except OSError:
        return ""


def tail_error(log):
    lines = read_text(log).splitlines()[-40:]
    errors = [line for line in lines if re.search(r"Error|Traceback", line)]
    return errors[-1].strip() if errors else ""


def page(runs, live):
    refresh = f'<meta http-equiv="refresh" content="{REFRESH_S}">' if live else ""
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    finished = sum(run["done"] for run in runs)
    badge = f"{finished}/{len(runs)} runs finished · refreshes every {REFRESH_S}s" if live else f"{finished} runs finished"
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">{refresh}
<title>jev-effort-gate × SkillOpt</title><style>{CSS}</style></head>
<body><main>
<header class="hero"><div class="eyebrow">Training log · updated {stamp}</div><h1>jev-effort-gate <span>×</span> SkillOpt</h1>
<p class="deck">{html.escape(deck([run for run in runs if run["round"] == CURRENT_ROUND]))}</p><span class="badge">{badge}</span></header>
<div class="legend"><span><b>Seed → Skill</b> · right effort picks / cases</span><span><b>pp</b> · percentage-point change</span></div>
{rounds(runs)}
<footer><p>Each run trains the three Jev questions on a different train/selection/test split of the same bench/small cases. Selection is the split SkillOpt gates on; test is never seen during training.</p>
<p>Splits hold four cases each, so one case moves a score by 25 pp.</p></footer>
</main></body></html>
"""


def rounds(runs):
    sections = []
    number = 0
    for name in dict.fromkeys(run["round"] for run in runs):
        sections.append(f'<h2>{html.escape(name)}</h2><p class="deck">{html.escape(ROUND_REWARD.get(name, ""))}</p><br>')
        for run in (run for run in runs if run["round"] == name):
            number += 1
            sections.append(run_panel(number, run))
    return "".join(sections)


def deck(runs):
    tested = [run["summary"] for run in runs if run["summary"].get("test_hard") is not None]
    if not tested:
        return "No run has reached its test evaluation yet. Selection scores below are live."
    gains = [s["test_hard"] - s["baseline_test_hard"] for s in tested]
    better = sum(gain > 0 for gain in gains)
    worse = sum(gain < 0 for gain in gains)
    return f"On held-out test cases, {better} of {len(tested)} finished runs beat the seed questions and {worse} lost to them."


def run_panel(number, run):
    summary = run["summary"]
    baseline = run["baseline"]
    seed_hard = sum(row["hard"] for row in baseline) / len(baseline) if baseline else None
    size = len(baseline) or 1
    rows = [step_row(step, seed_hard, size) for step in run["history"]]
    if summary.get("test_hard") is not None:
        rows.append(result_row("Test · held out", f"Best skill from step {summary.get('best_step')}",
                               summary["baseline_test_hard"], summary["test_hard"], run["test_size"] or 1))
    status = "finished" if run["done"] else (f"failed: {run['error']}" if run["error"] else "training")
    skill = html.escape(run["best_skill"] or read_text(SEED_SKILL))
    return f"""<section class="panel" aria-labelledby="panel-{number:02}">
<header><span class="eyebrow">{number:02} · {html.escape(status)}</span><h2 id="panel-{number:02}">{html.escape(run['name'])}</h2>
<p>{len(run['history'])} steps · seed selection score {fmt(seed_hard)}</p></header>
<div class="axis" aria-hidden="true"><span>−{AXIS_PP} pp</span><span>0</span><span>+{AXIS_PP} pp</span></div>
<ol>{"".join(rows)}</ol>
<details><summary>Current best questions</summary><pre>{skill}</pre></details>
</section>
"""


def step_row(step, seed_hard, size):
    label = f"Step {step['step']} · epoch {step['epoch']}"
    note = f"{step.get('action', '')} · train batch {fmt(step.get('rollout_hard'))}"
    candidate = step.get("selection_hard", step.get("candidate_gate_score"))
    return result_row(label, note, seed_hard, candidate, size)


def result_row(title, note, before, after, size):
    if before is None or after is None:
        metric = '<span class="metric-name">Selection</span><div class="track"></div><span class="scores">pending</span><strong class="delta"></strong>'
        return row(title, note, "flat", metric)
    delta_pp = (after - before) * 100
    direction = "up" if delta_pp > 0 else "down" if delta_pp < 0 else "flat"
    end = 50 + max(-AXIS_PP, min(AXIS_PP, delta_pp)) * 50 / AXIS_PP
    start = 50 if delta_pp >= 0 else end
    scores = f"{round(before * size)}/{size} → {round(after * size)}/{size}"
    metric = (f'<span class="metric-name">{"Test" if title.startswith("Test") else "Selection"}</span>'
              f'<div class="track" aria-hidden="true"><i style="--start:{start:.4f}%;--end:{end:.4f}%"></i></div>'
              f'<span class="scores" aria-label="Seed to skill: {scores}">{scores}</span>'
              f'<strong class="delta">{delta_pp:+.1f} <small>pp</small></strong>')
    return row(title, note, direction, metric)


def row(title, note, direction, metric):
    return (f'<li class="result"><div class="rowname"><h3>{html.escape(title)}</h3><p>{html.escape(note)}</p></div>'
            f'<div class="metrics"><div class="metric {direction}">{metric}</div></div></li>')


def fmt(value):
    return "—" if value is None else f"{value:.0%}"


if __name__ == "__main__":
    main()
