const express = require('express');
const { authenticate } = require('./auth/middleware');
const sessionRoutes = require('./routes/session');
const projectRoutes = require('./routes/projects');
const memberRoutes = require('./routes/members');

const app = express();

app.use(express.json());
app.use('/session', sessionRoutes);
app.use(authenticate);
app.use('/projects/:projectId/members', memberRoutes);
app.use('/projects', projectRoutes);

module.exports = app;
