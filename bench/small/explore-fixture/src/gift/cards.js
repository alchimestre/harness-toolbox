const CENTS = 100;

function giftBalanceCents(card) {
  return Math.floor(parseFloat(card.balance) * CENTS);
}

module.exports = { giftBalanceCents };
