# csvtally

Count and deduplicate rows in CSV files. No dependencies, Python 3.10 or newer.

## Commands

| Command | What it does |
|---|---|
| `count <file> --by <column>` | Print row counts per value of a column |
| `dedupe <file> --key <column>` | Print the file with duplicate keys removed |
| `sample <file> --n <rows>` | Print a random sample of rows |

## Examples

```
python -m csvtally count data.csv --by city
python -m csvtally dedupe data.csv --key email
python -m csvtally count data.csv --by city --delimiter ';'
python -m csvtally sample data.csv --n 10
```

Blank lines in the input are skipped.

## Library

`from csvtally import read_rows` returns the rows as a list of lists.
