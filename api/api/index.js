const express = require('express');
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message: 'Complete AI Recruitment System',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    availableEndpoints: [
      'GET / - Server status',
      'GET /health - Health check'
    ],
    version: '3.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString()
  });
});

module.exports = app;