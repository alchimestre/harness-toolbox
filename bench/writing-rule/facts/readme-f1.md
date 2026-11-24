# Facts about the tool (from the maintainers' wiki and chat)

Name: dedupe-csv. Binary: `dedupe-csv`. Repo: github.com/example/dedupe-csv. Language: Go.

What it does: removes duplicate rows from a CSV file, keyed by one or more columns, and writes the rest to standard output.

Install: `go install github.com/example/dedupe-csv@latest`. Needs Go 1.22 or newer. Prebuilt binaries for Linux and Windows are on the releases page.

Usage: `dedupe-csv [OPTIONS] <FILE>`

Options:
- `--key <COLUMN>`: column that defines a duplicate. Repeatable; a row is a duplicate when all key columns match.
- `--keep first|last`: which of the duplicate rows to keep. Default `first`.
- `--in-place`: rewrite the input file instead of writing to standard output.
- `--stats`: print the number of rows read, kept and removed to standard error.

Exit codes: 0 success, 1 the file has no header row, 2 bad arguments or an unknown `--key` column.

Limits: loads the whole file into memory. Does not sort the output. Header row is required.

Example: `dedupe-csv --key email --keep last contacts.csv > unique.csv`.

History and chatter: It started in 2020 as an awk one-liner that a contractor wrote for one client. It was rewritten in Go in 2022 and gained `--in-place` the same year. In v1.2 the default for `--keep` changed from `last` to `first`, which broke one team's pipeline (issue 41); the maintainers kept `first` and documented it. The contributors have been very helpful. Trying it is safe because without `--in-place` the input file is never touched. Licence Apache 2.0.
