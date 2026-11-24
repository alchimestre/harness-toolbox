const { deleteUser } = require('../admin/users');
const { setFlag } = require('../admin/settings');
const { exportReport } = require('../admin/reports');
const { purgeLogs: wipeHistory } = require('../admin/logs');
const { listAudit } = require('../admin/audit');

module.exports = { deleteUser, setFlag, exportReport, wipeHistory, listAudit };
