// api/index.js
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  res.status(200).json({
    message: 'Complete AI Recruitment System',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    platform: 'Vercel Serverless Functions',
    availableEndpoints: [
      'GET /api - Server status (this endpoint)',
      'GET /api/health - Health check',
      'POST /api/webhook - SharePoint file upload',
      'POST /api/zebraagent-trigger - Phone screening',
      'POST /api/vapi-callback - Process phone call results'
    ],
    recruitmentPipeline: {
      stage1: 'ZebraAgent - Phone Screening',
      stage2: 'LionAgent - Technical Interview', 
      stage3: 'WhaleAgent - Video Behavioral Interview',
      stage4: 'Human Decision'
    },
    version: '3.0.0',
    note: 'All endpoints work at /api/[endpoint-name]'
  });
}