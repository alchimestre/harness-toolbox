# flame-graph bench

Measures whether the flame-graph agent prompt draws a correct SVG: frames for every node, widths proportional to the totals, root equal to the grand total, files at the requested path, and the promised report. Checks parse the SVG with Python's XML library; no browser.

Run: `AGENT_PROMPT=<absolute prompt file> ./run.sh <case> <provider/model:level> <rep>`; needs `flamegraph.pl` and `bun` on PATH.
Self-test of the checks (a correct hand-made run passes, a double-counted one fails): `python3 selftest.py`.
Cases and the held-out split: `cases.md`.
