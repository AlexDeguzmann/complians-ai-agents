export default function handler(req, res) {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    platform: 'Vercel Serverless Functions',
    nodeVersion: process.version
  });
}
