const express = require('express');
const { findUserByEmail, passwordMatches } = require('../db');
const { issueToken, refreshToken, TokenError } = require('../auth/tokens');
const { safeNextPath } = require('../auth/redirect');

const router = express.Router();

router.post('/', (req, res) => {
  const user = findUserByEmail(req.body.email);
  if (!user || !passwordMatches(user, req.body.password)) {
    return res.status(401).json({ error: 'bad credentials' });
  }
  if (req.body.next !== undefined) return res.redirect(safeNextPath(req.body.next));
  return res.json({ token: issueToken(user) });
});

router.post('/refresh', (req, res) => {
  try {
    return res.json({ token: refreshToken(req.body.token) });
  } catch (error) {
    if (error instanceof TokenError) return res.status(401).json({ error: 'cannot refresh' });
    throw error;
  }
});

module.exports = router;
