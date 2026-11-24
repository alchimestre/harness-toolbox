function deleteUser(user, id) {
  if (!user.isAdmin) return { status: 403 };
  return { ok: true, deleted: id };
}

module.exports = { deleteUser };
