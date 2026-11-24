const { requireRole } = require('../auth');

function listAudit(user) {
  requireRole(user, 'admin');
  return { ok: true, entries: [] };
}

module.exports = { listAudit };
