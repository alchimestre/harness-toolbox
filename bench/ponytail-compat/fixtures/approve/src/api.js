const users = new Map();

function createUser(request) {
  const id = users.size + 1;
  users.set(id, { id, name: request.body.name });
  return { status: 201, body: users.get(id) };
}

function getUser(request) {
  const user = users.get(Number(request.params.id));
  return user ? { status: 200, body: user } : { status: 404, body: null };
}

module.exports = { createUser, getUser };
