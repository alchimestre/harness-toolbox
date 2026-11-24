const { isLoggedIn } = require('../auth');

function exportReport(user, period) {
  if (!isLoggedIn(user)) {
    throw Object.assign(new Error('forbidden'), { status: 403 });
  }
  return { ok: true, period, rows: 12 };
}

module.exports = { exportReport };
