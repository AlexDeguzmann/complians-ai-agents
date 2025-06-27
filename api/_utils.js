// /api/_utils.js
import { ConfidentialClientApplication } from '@azure/msal-node';
import { google } from 'googleapis';
import OpenAI from 'openai';
import axios from 'axios';

// GOOGLE SHEETS
const key = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON); // Vercel env var: stringified JSON
const sheets = google.sheets('v4');
const jwtClient = new google.auth.JWT({
  email: key.client_email,
  key: key.private_key.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
async function updateSheet(spreadsheetId, range, values) {
  await jwtClient.authorize();
  return sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    resource: { values },
    auth: jwtClient,
  });
}

// OPENAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// SHAREPOINT
async function getAccessToken() {
  const msalConfig = {
    auth: {
      clientId: process.env.SP_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${process.env.SP_TENANT_ID}`,
      clientSecret: process.env.SP_CLIENT_SECRET,
    },
  };
  const cca = new ConfidentialClientApplication(msalConfig);
  const tokenRequest = { scopes: ['https://graph.microsoft.com/.default'] };
  const response = await cca.acquireTokenByClientCredential(tokenRequest);
  return response.accessToken;
}
async function uploadToSharePoint(fileBuffer, fileName) {
  const accessToken = await getAccessToken();
  const graphBase = 'https://graph.microsoft.com/v1.0';
  const siteUrl = process.env.SP_SITE_URL;
  const siteResp = await axios.get(`${graphBase}/sites/${siteUrl.replace('https://', '').replace(/\//g, ':')}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const siteId = siteResp.data.id;
  const driveResp = await axios.get(`${graphBase}/sites/${siteId}/drives`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const driveId = driveResp.data.value[0].id;
  const folderPath = process.env.SP_FOLDER_PATH || "Shared Documents";
  const uploadUrl = `${graphBase}/drives/${driveId}/root:/${folderPath}/${fileName}:/content`;
  const uploadResp = await axios.put(uploadUrl, fileBuffer, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
  });
  return uploadResp.data;
}

// VAPI
async function initiateVapiCall(phoneNumber, candidateName, rowNumber) {
  const apiUrl = 'https://api.vapi.ai/call/phone';
  const apiKey = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  const payload = {
    assistantId,
    phoneNumberId,
    customer: { number: phoneNumber },
    metadata: { candidateName, rowNumber: rowNumber.toString() }
  };
  const response = await axios.post(apiUrl, payload, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  });
  return response.data;
}

export {
  openai,
  updateSheet,
  uploadToSharePoint,
  initiateVapiCall,
  jwtClient,
  sheets
};
