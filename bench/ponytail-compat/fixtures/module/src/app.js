const { checkout } = require('./cart');
const { footer } = require('./invoice');

console.log(checkout([{ cents: 1999 }], 'SAVE10'));
console.log(footer());
