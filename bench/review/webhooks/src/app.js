const express = require('express');
const webhookRoutes = require('./routes/webhook');

const app = express();

app.use(
  express.json({
    verify: (req, res, buffer) => {
      req.rawBody = buffer.toString('utf8');
    },
  }),
);
app.use('/webhooks', webhookRoutes);
app.use((error, req, res, next) => {
  res.status(error.status ?? 500).json({ error: error.message });
});

module.exports = app;
