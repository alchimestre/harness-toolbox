const crypto = require('crypto');

function hashPassword(salt, password) {
  return crypto.createHash('sha256').update(salt + password).digest('hex');
}

const users = [
  { id: 'u1', email: 'ada@example.com', role: 'admin', salt: 's1', passwordHash: hashPassword('s1', 'correct horse') },
  { id: 'u2', email: 'bob@example.com', role: 'member', salt: 's2', passwordHash: hashPassword('s2', 'battery staple') },
  { id: 'u3', email: 'cy@example.com', role: 'member', salt: 's3', passwordHash: hashPassword('s3', 'hunter two') },
];

const memberships = [
  { projectId: 'p1', userId: 'u1', role: 'owner', status: 'active' },
  { projectId: 'p1', userId: 'u2', role: 'editor', status: 'active' },
  { projectId: 'p1', userId: 'u3', role: 'viewer', status: 'invited' },
  { projectId: 'p2', userId: 'u2', role: 'owner', status: 'active' },
];

function findUserByEmail(email) {
  return users.find((user) => user.email === email) ?? null;
}

function passwordMatches(user, password) {
  return user.passwordHash === hashPassword(user.salt, password);
}

function findMembership(projectId, userId) {
  return memberships.find((row) => row.projectId === projectId && row.userId === userId) ?? null;
}

function listMembershipsFor(userId) {
  return memberships.filter((row) => row.userId === userId);
}

function setMembershipRole(projectId, userId, role) {
  const row = findMembership(projectId, userId);
  if (!row) return null;
  row.role = role;
  return row;
}

module.exports = { findUserByEmail, passwordMatches, findMembership, listMembershipsFor, setMembershipRole };
