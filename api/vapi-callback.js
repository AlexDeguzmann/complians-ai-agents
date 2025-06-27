import { openai, updateSheet } from './_utils';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const payload = req.body;
    if (payload.message?.type !== 'end-of-call-report') {
      return res.status(200).json({ message: 'Not end-of-call-report; ignoring.' });
    }
    const transcript = payload.message.transcript || '';
    const candidateName = payload.message.call?.metadata?.candidateName || 'Unknown';
    const row = payload.message.call?.metadata?.rowNumber;
    const stage = payload.message.call?.metadata?.stage;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'Call Queue';
    if (!transcript || !row) {
      return res.status(200).json({ message: 'No transcript or row; nothing to process.' });
    }
    if (stage === 'lionagent') {
      const prompt = `You are LionAgent, ...`; // your full prompt here
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });
      const aiFeedback = completion.choices[0].message.content;
      let overallScore = '';
      const scoreMatch = aiFeedback.match(/overall assessment score.*?([1-5])/i);
      if (scoreMatch) overallScore = scoreMatch[1];
      const range = `'${sheetName}'!M${row}:O${row}`;
      const values = [[transcript, overallScore, aiFeedback]];
      await updateSheet(spreadsheetId, range, values);
      const statusRange = `'${sheetName}'!L${row}`;
      await updateSheet(spreadsheetId, statusRange, [['Completed']]);
      res.json({ message: 'LionAgent callback processed', candidateName, aiFeedback, overallScore, row, stage: 'lionagent' });
    } else {
      // ZebraAgent
      const prompt = `You are ZebraAgent, ...`; // your full prompt here
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });
      const analysis = completion.choices[0].message.content;
      const values = [[transcript, '', analysis]];
      const range = `'${sheetName}'!G${row}:I${row}`;
      await updateSheet(spreadsheetId, range, values);
      res.status(200).json({
        message: 'ZebraAgent callback processed',
        analysis, candidateName, row, stage: 'zebraagent'
      });
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
