const FIXED_OFF = { SAVE5: 500 };
const PERCENT_OFF = { SAVE10: 10 };

function discountFor(code, cents) {
  if (code in FIXED_OFF) return Math.min(FIXED_OFF[code], cents);
  if (code in PERCENT_OFF) return (cents * PERCENT_OFF[code]) / 100;
  return 0;
}

module.exports = { discountFor };
