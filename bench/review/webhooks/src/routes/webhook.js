const express = require('express');
const { sign, signaturesMatch } = require('../crypto');
const { WEBHOOK_SECRET, TOLERANCE_SECONDS, SIGNATURE_HEADER, TIMESTAMP_HEADER } = require('../config');
const { applyEvent } = require('../ledger');
const { alreadyProcessed, markProcessed } = require('../dedupe');

const router = express.Router();

function ageSecondsOf(timestamp) {
  return Math.floor(Date.now() / 1000) - Number(timestamp);
}

function isFresh(ageSeconds) {
  return ageSeconds < TOLERANCE_SECONDS;
}

router.post('/billing', (req, res) => {
  const event = req.body;
  const timestamp = req.get(TIMESTAMP_HEADER);
  const expected = sign(WEBHOOK_SECRET, timestamp, req.rawBody);
  if (!signaturesMatch(expected, req.get(SIGNATURE_HEADER))) {
    return res.status(401).json({ error: 'bad signature' });
  }
  if (!isFresh(ageSecondsOf(timestamp))) return res.status(401).json({ error: 'stale timestamp' });
  if (alreadyProcessed(event.id)) return res.json({ received: true, duplicate: true });
  markProcessed(event.id);
  applyEvent(event);
  return res.json({ received: true });
});

module.exports = router;
