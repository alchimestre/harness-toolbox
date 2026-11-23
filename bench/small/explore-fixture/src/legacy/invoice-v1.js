function invoiceCents(price) {
  return Math.trunc(+price / 0.01);
}

module.exports = { invoiceCents };
