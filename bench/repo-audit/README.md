# repo-audit bench

Runs the repo-audit prompt on six seeded fixture repos (drift, dead exports, swallowed error, duplicate helper, untested function, plus decoys) and scores the report by file and line. Reward: recall minus 0.25 per decoy flagged; hard pass = at most 1 defect missed, no decoy, repo byte-identical, report written.

Run one: `AGENT_PROMPT=/abs/prompt.md ./run.sh a-terse anthropic/claude-sonnet-5-5:medium 1`, then read `runs/a-terse__*__1.{result,parts,fails,detail.json}`.
Self-check the scorer: `python3 check.py --selftest`.

Cases: wording variants `terse`, `pointed`, `urgent`, `casual` (`casual` for `a` and `b` only). Families: `a`, `b` dev (`a` is the dev gate, `b` trains). `c`, `d` are the contaminated final set (seed sanity ran on them). `e`, `f` are the clean final gate (`terse`, `pointed` only). `cases.md` lists the split.

Seeded truth lives in `truth/<repo>.json`; fixtures in `fixtures/<repo>/`.
