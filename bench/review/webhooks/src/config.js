const TOLERANCE_SECONDS = 300;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

module.exports = {
  WEBHOOK_SECRET: requireEnv('BILLING_WEBHOOK_SECRET'),
  TOLERANCE_SECONDS,
  SIGNATURE_HEADER: 'x-billing-signature',
  TIMESTAMP_HEADER: 'x-billing-timestamp',
};
