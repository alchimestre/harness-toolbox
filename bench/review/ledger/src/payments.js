const { retry } = require('./retry');

const PROVIDER_BACKOFF = { tries: 4, delayMs: 2000 };

async function charge(gateway, order) {
  return retry(
    () => gateway.charge({ amountCents: order.totalCents, idempotencyKey: order.id }),
    PROVIDER_BACKOFF,
  );
}

async function refund(gateway, order) {
  return retry(() => gateway.refund({ chargeId: order.chargeId }), PROVIDER_BACKOFF);
}

module.exports = { charge, refund };
