const { prorateCredit } = require('./prorate');

const balances = new Map();

function credit(accountId, cents) {
  balances.set(accountId, (balances.get(accountId) ?? 0) + cents);
}

function applyEvent(event) {
  if (event.type === 'credit.issued') {
    credit(event.data.accountId, event.data.amountCents);
    return;
  }
  if (event.type === 'plan.downgraded') {
    const { accountId, priceCents, periodDays, unusedDays } = event.data;
    credit(accountId, prorateCredit(priceCents, periodDays, unusedDays));
    return;
  }
  throw new Error(`unknown event type ${event.type}`);
}

module.exports = { applyEvent, balances };
