function isLoggedIn(user) {
  return Boolean(user && user.id != null);
}

function requireRole(user, role) {
  if (!user || !user.roles) {
    const error = new Error('forbidden');
    error.status = 403;
    throw error;
  }
}

module.exports = { isLoggedIn, requireRole };
