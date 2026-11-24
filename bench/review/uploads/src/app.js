const express = require('express');
const uploadRoutes = require('./routes/uploads');

const app = express();

app.use((req, res, next) => {
  req.user = { id: req.get('X-Authenticated-User') };
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', uploadRoutes);

module.exports = app;
