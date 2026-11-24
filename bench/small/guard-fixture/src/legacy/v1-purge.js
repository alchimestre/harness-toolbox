function purgeV1(user, days) {
  return { ok: true, removedAfterDays: days, by: user && user.id };
}

module.exports = { purgeV1 };
