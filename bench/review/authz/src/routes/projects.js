const express = require('express');
const { findMembership, listMembershipsFor } = require('../db');

const router = express.Router();

router.param('projectId', (req, res, next, projectId) => {
  const membership = findMembership(projectId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'not a member' });
  req.membership = membership;
  return next();
});

function listOwnProjects(req, res) {
  const userId = req.query.userId ?? req.user.id;
  res.json(listMembershipsFor(userId));
}

router.get('/', listOwnProjects);

router.get('/:projectId', (req, res) => {
  res.json({ id: req.params.projectId, role: req.membership.role });
});

module.exports = router;
