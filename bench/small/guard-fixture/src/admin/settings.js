function setFlag(user, name, value) {
  if (user.role !== 'admin') {
    throw Object.assign(new Error('forbidden'), { status: 403 });
  }
  return { ok: true, flag: name, value };
}

module.exports = { setFlag };
