// api/vapi-callback.js
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed - POST only' });
    return;
  }

  // Simple callback response for now
  res.status(200).json({
    message: 'VAPI callback endpoint working',
    timestamp: new Date().toISOString(),
    receivedPayload: req.body,
    note: 'Full callback processing will be added with environment variables'
  });
}