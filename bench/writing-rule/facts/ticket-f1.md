# Raw bug report (pasted from the tracker)

Tracker: IMP-118. Type: Bug. Status: Open. Priority: P1. Assignee: the platform team. Reporter: support, filed 2024-08-14.

Report: "A customer imported a 12,000-line contacts CSV exported from a spreadsheet. The import said 'Imported 11,812 contacts' and showed no error. 188 contacts are missing. The file starts with a UTF-8 byte order mark."

History, as far as we can tell: the importer has used the standard CSV reader since v1.8. In March 2024 a change added a dedupe pass (PR #77). The dedupe compared keys by header name, and with a byte order mark on the file the first header did not match, so every row with an empty key was dropped. The code that should warn on an empty key is commented out. We shipped that in v3.0. Support first saw it in May 2024 (SUP-5102) and closed it as "customer error". It came back in July (SUP-5260) and in August (SUP-5333).

Reproduction: CSV with a byte order mark and header `email,name`, three data rows, run `importctl contacts run.csv`. Expected 3 imported. Actual 2 imported, exit code 0, summary says "Imported 2 contacts".

Workaround: strip the byte order mark with `sed -i '1s/^\xEF\xBB\xBF//' file.csv` before importing.

Discussion: the assignee thinks the dedupe should use the parsed header; the author of PR #77 says the warning must come back. Nobody objects to failing loudly on bad input.

This blocks the 3.1 release (REL-204) because the onboarding checklist depends on the import.

Scope: only files that start with a byte order mark are affected.
