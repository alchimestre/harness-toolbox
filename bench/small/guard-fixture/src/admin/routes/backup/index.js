function backupNow(user) {
  return { ok: true, file: 'backup.tar' };
}

const routes = { 'backup.now': backupNow };

module.exports = { routes };
