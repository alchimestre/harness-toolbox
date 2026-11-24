# invoice-totals

Sums the lines of an invoice JSON file and prints the total.

## Usage

| Command | What it does |
|---|---|
| `invoice total <file>` | Print the total of all lines |
| `invoice export <file> <out.csv>` | Write lines to CSV |

`--currency <code>` sets the output currency label. Default `EUR`.

    node bin/invoice.js total invoices/march.json --currency USD

## Library

    const { sumCents } = require("./src/totals");

Run tests with `npm test`.
