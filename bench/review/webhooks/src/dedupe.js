const processed = new Set();

function alreadyProcessed(eventId) {
  return processed.has(eventId);
}

function markProcessed(eventId) {
  processed.add(eventId);
}

module.exports = { alreadyProcessed, markProcessed };
