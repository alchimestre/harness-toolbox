# Raw bug report (pasted from the tracker)

Tracker: PAY-481. Type: Bug. Status: Open. Priority: P2. Assignee: the payments team. Reporter: the finance team, filed 2024-03-02.

Reporter's report: "Our finance team ran `acme export --all` on the ledger and the CSV only had 10,000 rows. The ledger has 41,870. The command exited 0 and printed nothing odd, so nobody noticed for two weeks. We reconciled against the CSV and the books were off."

History, as far as we can tell: the exporter originally streamed rows straight to disk, with no limit. In the March 2023 refactor (PR #212) it was changed to collect rows into an array first so the summary line could print a row count. The same change added `MAX_ROWS = 10000` to avoid running out of memory on small containers, and the cap was supposed to raise an error. The error branch was never wired up, so the cap truncates silently. We shipped that in v2.1. Support first saw it in July 2023 (SUP-3310) and closed it as "user error". It came back in September (SUP-3544) and in January (SUP-3790).

Reproduction: ledger with 10,001 or more rows, run `acme export --all --out ledger.csv`, count lines. Expected 10,001 lines (header plus rows). Actual 10,001 lines but the last row is row 10,000 and the rest are dropped. Exit code 0. Summary line says "Exported 10000 rows".

Workaround: `acme export --all --chunk 5000` writes several files; each file is complete, nothing is dropped.

Discussion: the assignee thinks the cap should go entirely and the exporter should stream again; the PR author says the summary row count is needed by finance and could come from a `SELECT COUNT(*)` instead. Nobody objects to streaming. Memory on the small containers is 512 MB.

This blocks the 2.4 release (REL-77) because finance will not sign off on 2.4 with this open.

Scope: only `export --all`. `export --since` is unaffected because it never loads more than a day.
