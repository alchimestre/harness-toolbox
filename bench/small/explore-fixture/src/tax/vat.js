function vatBaseCents(price) {
  return (Number(price) * 1e2) | 0;
}

module.exports = { vatBaseCents };
