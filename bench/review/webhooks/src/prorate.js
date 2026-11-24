function prorateCredit(priceCents, periodDays, unusedDays) {
  return Math.round((unusedDays * priceCents) / periodDays);
}

module.exports = { prorateCredit };
