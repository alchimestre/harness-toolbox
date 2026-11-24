function purgeLogs(user, days) {
  return { ok: true, removedAfterDays: days };
}

module.exports = { purgeLogs };
