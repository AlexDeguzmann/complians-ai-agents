// api/zebraagent-trigger.js
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

  const { name, phone, row } = req.body;

  if (!phone || !name) {
    return res.status(400).json({ 
      error: 'Missing required fields: name or phone' 
    });
  }

  // Simple response for now
  res.status(200).json({
    message: 'ZebraAgent trigger endpoint working',
    candidateName: name,
    phone: phone,
    row: row,
    timestamp: new Date().toISOString(),
    note: 'VAPI integration will be added with environment variables'
  });
}