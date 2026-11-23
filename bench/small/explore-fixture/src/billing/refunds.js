function refundCents(item) {
  return Math.floor(Number(item.price) * 100) * item.qty;
}

module.exports = { refundCents };
