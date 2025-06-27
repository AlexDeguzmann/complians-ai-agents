import { updateSheet } from './_utils';
import axios from 'axios';

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
      const statusValues = [['LionAgent Called']];
      const statusRange = `'Call Queue'!L${row}`;
      await updateSheet(process.env.GOOGLE_SHEET_ID, statusRange, statusValues);
    }
    const callResponse = await axios.post(
      'https://api.vapi.ai/call/phone',
      {
        assistantId: process.env.LIONAGENT_VAPI_ASSISTANT_ID,
        phoneNumberId: process.env.LIONAGENT_PHONE_NUMBER_ID,
        customer: { number: phone },
        metadata: {
          candidateName: name,
          rowNumber: row,
          stage: 'lionagent'
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    res.json({
      status: 'LionAgent call scheduled',
      data: callResponse.data
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to initiate LionAgent call', details: err.message });
  }
}
