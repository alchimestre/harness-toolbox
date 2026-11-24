const express = require('express');
const { setMembershipRole } = require('../db');

const router = express.Router({ mergeParams: true });

router.patch('/:userId', (req, res) => {
  const updated = setMembershipRole(req.params.projectId, req.params.userId, req.body.role);
  if (!updated) return res.status(404).json({ error: 'no such membership' });
  return res.json(updated);
});

module.exports = router;
