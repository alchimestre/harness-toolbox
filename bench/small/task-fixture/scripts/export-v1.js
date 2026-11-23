const { toCents } = require('../src/legacy/money');

for (const price of process.argv.slice(2)) console.log(toCents(price));
