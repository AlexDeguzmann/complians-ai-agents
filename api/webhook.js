import { uploadToSharePoint } from './_utils';
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const { fileId, applicantName } = req.body;
    if (!fileId) {
      return res.status(400).json({ error: 'Missing fileId' });
    }
    const hubspotUrl = `https://api.hubapi.com/files/v3/files/${fileId}/signed-url`;
    const signedUrlResp = await axios.get(hubspotUrl, {
      headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}` }
    });
    const signedUrl = signedUrlResp.data.url;
    if (!signedUrl) {
      return res.status(500).json({ error: 'No valid signed URL from HubSpot' });
    }
    const cvFileName = `${(applicantName || 'cv').replace(/[^a-zA-Z0-9-_\.]/g, "_")}.docx`;
    const fileResp = await axios.get(signedUrl, { responseType: 'arraybuffer' });
    const fileBuffer = Buffer.from(fileResp.data);
    const uploadResp = await uploadToSharePoint(fileBuffer, cvFileName);
    res.json({
      success: true,
      id: uploadResp.id,
      webUrl: uploadResp.webUrl,
      message: 'Uploaded to SharePoint successfully',
      fileName: cvFileName,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
