# logsift

Filter and summarise newline-delimited JSON logs.

## Usage

```
node bin/logsift.js app.log --min-level warn --since 10m
node bin/logsift.js app.log -f table
node bin/logsift.js app.log --stats
node bin/logsift.js export app.log --to csv
```

Options:

| Option | Meaning |
|---|---|
| `--min-level <level>` | Drop entries below `debug`, `info`, `warn` or `error` |
| `--since <n>[smh]` | Keep entries newer than the window |
| `--format`, `-f` | `lines` (default), `table` or `json` |
| `--stats` | Print counts per level and the busiest minute |

Set `LOGSIFT_COLOR=0` to disable colour.

## Development

```
npm test
```
