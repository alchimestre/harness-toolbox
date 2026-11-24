function formatAmount(cents) {
  const absolute = Math.abs(cents);
  const whole = String(Math.floor(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = `$${whole}.${String(absolute % 100).padStart(2, '0')}`;
  return cents < 0 ? `(${text})` : text;
}

module.exports = { formatAmount };
