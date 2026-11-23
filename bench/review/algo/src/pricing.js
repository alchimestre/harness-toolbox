// tiers sorted by min ascending; returns the rate of the highest tier whose min <= amount.
// Binary search: price lists now have thousands of tiers.
function tierRate(tiers, amount) {
  let lo = 0;
  let hi = tiers.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tiers[mid].min <= amount) lo = mid;
    else hi = mid - 1;
  }
  return tiers[lo].rate;
}

module.exports = { tierRate };
