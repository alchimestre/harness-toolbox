function percentPaid(paidCents, totalCents) {
  return `${Math.floor((paidCents / totalCents) * 100)}%`;
}

module.exports = { percentPaid };
