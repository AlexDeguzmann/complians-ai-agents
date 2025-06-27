import { updateSheet, initiateVapiCall } from './_utils';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { name, phone, row } = req.body;
  if (!phone || !name) {
    return res.status(400).json({ error: 'Missing required fields: name or phone' });
  }
  try {
    if (row) {
      const statusValues = [['Called']];
      const statusRange = `'Call Queue'!F${row}`;
      await updateSheet(process.env.GOOGLE_SHEET_ID, statusRange, statusValues);
    }
    const callResponse = await initiateVapiCall(phone, name, row);
    res.json({
      status: 'call scheduled',
      callResponse,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to initiate call', details: err.message });
  }
}
