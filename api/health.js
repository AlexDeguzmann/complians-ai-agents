// api/health.js
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    platform: 'Vercel Serverless Functions',
    nodeVersion: process.version,
    environment: {
      hasHubspotToken: !!process.env.HUBSPOT_TOKEN,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasGoogleSheetId: !!process.env.GOOGLE_SHEET_ID,
      hasSharePointConfig: !!(process.env.SP_CLIENT_ID && process.env.SP_TENANT_ID),
      hasVapiKey: !!process.env.VAPI_API_KEY,
      hasVapiAssistantId: !!process.env.VAPI_ASSISTANT_ID
    },
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
}