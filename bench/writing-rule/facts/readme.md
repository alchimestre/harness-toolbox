# Facts about the tool (from the maintainers' wiki and chat)

Name: stale. Binary: `stale`. Repo: github.com/example/stale. Language: Rust.

What it does: finds files in a directory tree that have not been modified for a given time, lists them, and optionally deletes them.

Install: `cargo install stale`. Needs Rust 1.75 or newer. Prebuilt binaries for Linux and macOS are on the releases page.

Usage: `stale [OPTIONS] <DIR>`

Options:
- `--age <DURATION>`: minimum age to count as stale, for example `14d`, `36h`. Default `14d`.
- `--delete`: delete the stale files. Without it the tool only lists them (dry run).
- `--ignore <GLOB>`: skip files matching the glob. Repeatable.
- `--json`: print one JSON object per file instead of plain paths.
- `--follow-links`: follow symlinks. Off by default.

Environment: `STALE_IGNORE` holds a comma-separated list of globs, merged with `--ignore`.

Exit codes: 0 nothing stale found, 1 stale files found (and listed or deleted), 2 bad arguments or unreadable directory.

Limits: never deletes directories, only files. Never touches files outside `<DIR>`. Refuses to run on `/`.

Example: `stale --age 30d --ignore '*.keep' ~/Downloads` lists files older than 30 days. Add `--delete` to remove them.

History and chatter: It began in 2021 as a 40-line bash script called cleanup.sh that the original author wrote because their Downloads folder had 80 GB in it. It was rewritten in Rust in 2023 for speed. In v0.4 the default age changed from 30d to 14d, which caused an argument (TOOL-9) about whether dry run should be the default; dry run won. We are proud of how fast it is and the community has been wonderful. Beginners should not be scared: it is very safe to try because it does nothing without --delete. Licence MIT.
