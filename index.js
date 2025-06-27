require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { google } = require('googleapis');
const OpenAI = require("openai");
const path = require('path');
console.log('TAVUS_API_KEY:', process.env.TAVUS_API_KEY);
console.log('TAVUS_PERSONA_ID:', process.env.TAVUS_PERSONA_ID);
console.log('TAVUS_REPLICA_ID:', process.env.TAVUS_REPLICA_ID);

const app = express();
app.use(express.json());

// ===========================================
// SHARED CONFIGURATION
// ===========================================

// Google service account credentials
// Build Google credentials from environment variables
const key = {
  type: process.env.GOOGLE_TYPE,
  project_id: process.env.GOOGLE_PROJECT_ID,
  private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
  private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  client_id: process.env.GOOGLE_CLIENT_ID,
  auth_uri: process.env.GOOGLE_AUTH_URI,
  token_uri: process.env.GOOGLE_TOKEN_URI,
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLIENT_EMAIL)}`,
  universe_domain: "googleapis.com"
};

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===========================================
// GOOGLE SHEETS SETUP
// ===========================================

const sheets = google.sheets('v4');

const jwtClient = new google.auth.JWT({
  email: key.client_email,
  key: key.private_key.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

// Test Google Sheets authentication on startup
async function testGoogleSheetsAuth() {
  try {
    await jwtClient.authorize();
    console.log('✅ Google Sheets authentication successful!');
  } catch (error) {
    console.error('❌ Google Sheets authentication failed:', error.message);
  }
}

async function updateSheet(spreadsheetId, range, values) {
  try {
    await jwtClient.authorize();
    const request = {
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      resource: { values },
      auth: jwtClient,
    };
    const result = await sheets.spreadsheets.values.update(request);
    console.log('Sheet updated successfully:', result.data.updatedCells, 'cells updated');
    return result;
  } catch (error) {
    console.error('Error updating sheet:', error.message);
    throw error;
  }
}

// ===========================================
// SHAREPOINT SETUP
// ===========================================

// Function to get Azure access token for Microsoft Graph API
async function getAccessToken() {
  const msalConfig = {
    auth: {
      clientId: process.env.SP_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${process.env.SP_TENANT_ID}`,
      clientSecret: process.env.SP_CLIENT_SECRET,
    },
  };
  const cca = new ConfidentialClientApplication(msalConfig);

  const tokenRequest = {
    scopes: ['https://graph.microsoft.com/.default'],
  };
  const response = await cca.acquireTokenByClientCredential(tokenRequest);
  return response.accessToken;
}

// Function to upload the file to SharePoint
async function uploadToSharePoint(fileBuffer, fileName) {
  const accessToken = await getAccessToken();

  const graphBase = 'https://graph.microsoft.com/v1.0';
  const siteUrl = process.env.SP_SITE_URL;

  // Get Site ID
  const siteResp = await axios.get(`${graphBase}/sites/${siteUrl.replace('https://', '').replace(/\//g, ':')}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const siteId = siteResp.data.id;

  // Get Drive ID (document library)
  const driveResp = await axios.get(`${graphBase}/sites/${siteId}/drives`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const driveId = driveResp.data.value[0].id;

  // Upload file to SharePoint folder
  const folderPath = process.env.SP_FOLDER_PATH || "Shared Documents";
  const uploadUrl = `${graphBase}/drives/${driveId}/root:/${folderPath}/${fileName}:/content`;

  console.log('Upload URL:', uploadUrl);

  const uploadResp = await axios.put(uploadUrl, fileBuffer, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
  });
  return uploadResp.data;
}

// ===========================================
// VAPI FUNCTIONS
// ===========================================

// FIXED: Initiate VAPI call with phoneNumberId
async function initiateVapiCall(phoneNumber, candidateName, rowNumber) {
  try {
    const apiUrl = 'https://api.vapi.ai/call/phone'; // FIXED: Use /call/phone endpoint
    const apiKey = process.env.VAPI_API_KEY;
    const assistantId = process.env.VAPI_ASSISTANT_ID;
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID; // Add this to your .env

    const payload = {
      assistantId: assistantId,
      phoneNumberId: phoneNumberId, // Use your VAPI phone number ID
      customer: {
        number: phoneNumber
      },
      metadata: { 
        candidateName, 
        rowNumber: rowNumber.toString() 
      }
    };

    console.log('Sending VAPI request:', JSON.stringify(payload, null, 2));

    const response = await axios.post(apiUrl, payload, {
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ VAPI call initiated successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('VAPI call initiation failed:', error.response?.data || error.message);
    throw error;
  }
}

// ===========================================
// WEBHOOK ENDPOINTS
// ===========================================

// Root endpoint - shows server status
app.get('/', (req, res) => {
  res.json({
    message: 'Complete AI Recruitment System',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    availableEndpoints: [
      'GET / - Server status',
      'GET /health - Health check',
      'POST /webhook - SharePoint file upload',
      'POST /zebraagent-trigger - Phone screening (5-10 min)',
      'POST /lionagent-trigger - Technical interview (10-15 min)',
      'POST /whaleagent-trigger - Video behavioral interview (20-30 min)',
      'POST /vapi-callback - Process phone call results',
      'POST /whaleagent-callback - Process video interview results'
    ],
    recruitmentPipeline: {
      stage1: 'ZebraAgent - Phone Screening',
      stage2: 'LionAgent - Technical Interview', 
      stage3: 'WhaleAgent - Video Behavioral Interview',
      stage4: 'Human Decision'
    },
    version: '3.0.0'
  });
});

// SharePoint file upload webhook (for Zapier)
app.post('/webhook', async (req, res) => {
  try {
    console.log('==== SHAREPOINT WEBHOOK RECEIVED ====');
    console.log('Request body:', req.body);
    
    const { fileId, applicantName } = req.body;
    if (!fileId) {
      console.log('❌ Missing fileId in request');
      return res.status(400).json({ error: 'Missing fileId' });
    }

    console.log(`Processing file upload: fileId=${fileId}, applicantName=${applicantName}`);

    // 1. Get signed URL from HubSpot
    console.log('Step 1: Getting signed URL from HubSpot...');
    const hubspotUrl = `https://api.hubapi.com/files/v3/files/${fileId}/signed-url`;
    const signedUrlResp = await axios.get(hubspotUrl, {
      headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}` }
    });
    const signedUrl = signedUrlResp.data.url;
    if (!signedUrl) {
      console.log('❌ No valid signed URL from HubSpot');
      return res.status(500).json({ error: 'No valid signed URL from HubSpot' });
    }
    console.log('✅ Got signed URL from HubSpot');

    // 2. Download file from HubSpot
    console.log('Step 2: Downloading file from HubSpot...');
    const cvFileName = `${(applicantName || 'cv').replace(/[^a-zA-Z0-9-_\.]/g, "_")}.docx`;
    const fileResp = await axios.get(signedUrl, { responseType: 'arraybuffer' });
    const fileBuffer = Buffer.from(fileResp.data);
    console.log(`✅ Downloaded file: ${cvFileName} (${fileBuffer.length} bytes)`);

    // 3. Upload to SharePoint
    console.log('Step 3: Uploading to SharePoint...');
    const uploadResp = await uploadToSharePoint(fileBuffer, cvFileName);
    
    console.log('✅ File uploaded to SharePoint successfully');
    res.json({
      success: true,
      id: uploadResp.id,
      webUrl: uploadResp.webUrl,
      message: 'Uploaded to SharePoint successfully',
      fileName: cvFileName,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('==== SHAREPOINT UPLOAD ERROR ====');
    console.error('Error type:', err.constructor.name);
    console.error('Error message:', err.message);
    
    if (err.response) {
      console.error('HTTP Status:', err.response.status);
      console.error('HTTP Status Text:', err.response.statusText);
      console.error('Response Data:', err.response.data);
      console.error('Response Headers:', err.response.headers);
      console.error('Request URL:', err.config?.url);
    } else if (err.request) {
      console.error('No response received:', err.request);
    } else {
      console.error('Error details:', err);
    }
    
    // More specific error responses
    let errorMessage = 'Server error';
    let statusCode = 500;
    
    if (err.response?.status === 401) {
      errorMessage = 'Authentication failed - check HubSpot token or SharePoint credentials';
      statusCode = 401;
    } else if (err.response?.status === 403) {
      errorMessage = 'Permission denied - check SharePoint permissions';
      statusCode = 403;
    } else if (err.response?.status === 404) {
      errorMessage = 'Resource not found - check file ID or SharePoint paths';
      statusCode = 404;
    } else if (err.message?.includes('ENOTFOUND') || err.message?.includes('network')) {
      errorMessage = 'Network error - check internet connection';
      statusCode = 503;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      details: err.message || err.toString(),
      timestamp: new Date().toISOString(),
      requestData: req.body
    });
  }
});

// ZebraAgent trigger endpoint
app.post('/zebraagent-trigger', async (req, res) => {
  try {
    console.log('==== ZEBRAAGENT TRIGGER RECEIVED ====');
    const { name, phone, row } = req.body;
    console.log('Request data:', req.body);

    if (!phone || !name) {
      return res.status(400).json({ error: 'Missing required fields: name or phone' });
    }

    // First, update the status to "Called" to prevent duplicate calls
    if (row) {
      console.log(`Updating status to "Called" for row ${row}...`);
      try {
        const statusValues = [['Called']];
        const statusRange = `'Call Queue'!F${row}`; // Column F = Status
        await updateSheet(process.env.GOOGLE_SHEET_ID, statusRange, statusValues);
        console.log('✅ Status updated to "Called"');
      } catch (statusError) {
        console.log('⚠️ Could not update status, but continuing with call...');
      }
    }

    const callResponse = await initiateVapiCall(phone, name, row);
    console.log('✅ ZebraAgent call scheduled:', callResponse);

    res.json({ 
      status: 'call scheduled', 
      callResponse,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('==== ZEBRAAGENT TRIGGER ERROR ====');
    console.error('Failed to initiate ZebraAgent call:', err);
    res.status(500).json({ 
      error: 'Failed to initiate call', 
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// LionAgent trigger endpoint
app.post('/lionagent-trigger', async (req, res) => {
  try {
    console.log('==== LIONAGENT TRIGGER RECEIVED ====');
    const { name, phone, row } = req.body;

    if (!phone || !name) {
      return res.status(400).json({ error: 'Missing required fields: name or phone' });
    }

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
    console.error('LionAgent trigger error:', err.message);
    
    // Show the actual VAPI error details
    if (err.response && err.response.data) {
      console.error('VAPI Error Details:', JSON.stringify(err.response.data, null, 2));
      console.error('VAPI Error Message Array:', err.response.data.message);
      
      // If message is an array, log each item
      if (Array.isArray(err.response.data.message)) {
        console.error('Individual error messages:');
        err.response.data.message.forEach((msg, index) => {
          console.error(`  ${index + 1}:`, msg);
        });
      }
    }
    
    res.status(500).json({ 
      error: 'Failed to initiate LionAgent call',
      vapiError: err.response?.data,
      details: err.response?.data?.message || err.message
    });
  }
});

// UNIFIED SMART VAPI CALLBACK - Handles both ZebraAgent and LionAgent
app.post('/vapi-callback', async (req, res) => {
  try {
    console.log('==== VAPI CALLBACK RECEIVED ====');
    const payload = req.body;
    console.log('VAPI callback payload type:', payload.message?.type);

    // Only process end-of-call-report messages
    if (payload.message?.type !== 'end-of-call-report') {
      console.log('⚠️ Not an end-of-call-report. Ignoring this callback.');
      return res.status(200).json({ message: 'Not end-of-call-report; ignoring.' });
    }

    // Extract data from end-of-call-report
    const transcript = payload.message.transcript || '';
    const candidateName = payload.message.call?.metadata?.candidateName || 'Unknown';
    const row = payload.message.call?.metadata?.rowNumber;
    const stage = payload.message.call?.metadata?.stage;
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheetName = 'Call Queue';

    if (!transcript || !row) {
      console.log('⚠️ No transcript or row number in callback.');
      return res.status(200).json({ message: 'No transcript or row; nothing to process.' });
    }

    console.log('📞 Processing call for:', candidateName);
    console.log('Stage:', stage);
    console.log('Row:', row);
    console.log('Transcript length:', transcript.length);

    // Determine if this is ZebraAgent or LionAgent based on stage
    if (stage === 'lionagent') {
      // === LIONAGENT PROCESSING ===
      console.log('🦁 Processing LionAgent technical interview...');

      const prompt = `
You are LionAgent, a Technical Interview AI.
Given this technical interview transcript, for each question:
1. Identify the question and the candidate's answer.
2. Score the answer 1-5 for quality and relevance (5 = excellent, 1 = poor).
3. Write a brief comment on the answer.
At the end, provide:
- An overall assessment score (1-5)
- A short recommendation ("Hire", "Consider", or "Do Not Hire").

Transcript:
${transcript}
`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });

      const aiFeedback = completion.choices[0].message.content;
      console.log('✅ LionAgent AI scoring generated');

      // Extract overall score
      let overallScore = '';
      const scoreMatch = aiFeedback.match(/overall assessment score.*?([1-5])/i);
      if (scoreMatch) {
        overallScore = scoreMatch[1];
      }

      // Update Google Sheet - Tech columns (M, N, O)
      const range = `'${sheetName}'!M${row}:O${row}`;
      const values = [[transcript, overallScore, aiFeedback]];
      await updateSheet(spreadsheetId, range, values);

      // Update status to Completed
      const statusRange = `'${sheetName}'!L${row}`;
      await updateSheet(spreadsheetId, statusRange, [['Completed']]);

      console.log('✅ LionAgent callback processed and sheet updated');

      res.json({
        message: 'LionAgent callback processed and sheet updated',
        candidateName,
        aiFeedback,
        overallScore,
        row,
        stage: 'lionagent'
      });

    } else {
      // === ZEBRAAGENT PROCESSING ===
      console.log('🦓 Processing ZebraAgent screening call...');

      const prompt = `
You are ZebraAgent, a Voice AI Screener.
Given a transcript of a screening call, return:
1. Summary of key responses.
2. Score out of 5 for communication and confidence.
3. Notes to help the recruiter make a next step decision.
Output:
Transcribed and scored phone screening.

Transcript:
${transcript}
`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });

      const analysis = completion.choices[0].message.content;
      console.log('✅ ZebraAgent GPT analysis generated');

      // Update Google Sheet - Screening columns (G, H, I)
      const values = [[transcript, '', analysis]];
      const range = `'${sheetName}'!G${row}:I${row}`;
      await updateSheet(spreadsheetId, range, values);

      console.log('✅ ZebraAgent callback processed and sheet updated');

      res.status(200).json({ 
        message: 'ZebraAgent callback processed and sheet updated', 
        analysis,
        candidateName,
        row,
        stage: 'zebraagent'
      });
    }

  } catch (err) {
    console.error('==== VAPI CALLBACK ERROR ====');
    console.error('Error processing VAPI callback:', err);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});
// WhaleAgent trigger endpoint - Send video interview invitation
app.post('/whaleagent-trigger', async (req, res) => {
  try {
    console.log('==== WHALEAGENT TRIGGER RECEIVED ====');
    const { candidateName, candidateEmail, row } = req.body;
    
    if (!candidateEmail || !candidateName) {
      return res.status(400).json({ 
        error: 'Missing required fields: candidateName or candidateEmail' 
      });
    }

    console.log(`🐋 Creating video interview for: ${candidateName} (${candidateEmail})`);

    // 1. Update Google Sheet status
    if (row) {
      const statusValues = [['Video Interview Sent']];
      const statusRange = `'Call Queue'!P${row}`; // Column P = Video Status
      await updateSheet(process.env.GOOGLE_SHEET_ID, statusRange, statusValues);
      console.log('✅ Status updated to "Video Interview Sent"');
    }

    // 2. Create Tavus conversation for video interview
    const tavusPayload = {
      replica_id: process.env.TAVUS_REPLICA_ID,
      persona_id: process.env.TAVUS_PERSONA_ID,
      callback_url: `${req.protocol}://${req.get('host')}/whaleagent-callback`,
      conversation_name: `Behavioral Interview - ${candidateName}`,
      conversational_context: `You are WhaleAgent, a professional AI interviewer conducting a behavioral interview for a Care Assistant position at Harley Jai Care in Northern Ireland.

ABOUT THE ROLE: 
This position involves providing personal care to individuals with complex needs, learning disabilities, and challenging behavior in supported living settings. The role requires empathy, patience, professional boundaries, and the ability to work under pressure.

INTERVIEW STRUCTURE:
1. Start with: "Hello ${candidateName}, I'm WhaleAgent. Thank you for progressing to our video interview for the Care Assistant position at Harley Jai Care. This interview will focus on your experience and approach to care work. Are you ready to begin?"

2. Ask these questions ONE AT A TIME, waiting for complete responses:

CORE CARE QUESTIONS:
- "Tell me about a time when you provided personal care to someone with dignity and respect. How did you ensure their privacy and independence?"

- "Describe a situation where you worked with someone with learning disabilities or challenging behavior. How did you adapt your approach?"

- "Give me an example of when you had to follow strict protocols or procedures, such as medication administration or safety guidelines. What was your approach?"

TEAMWORK & COMMUNICATION:
- "Tell me about a time when you worked as part of a care team. How did you communicate important information about a client's wellbeing?"

- "Describe a situation where you had to maintain professional boundaries with a client or their family. How did you handle it?"

CHALLENGING SITUATIONS:
- "Tell me about a time when you dealt with a medical emergency or safety concern. What steps did you take?"

- "Describe a situation where you had to work with someone who was distressed or agitated. How did you de-escalate the situation?"

- "Give me an example of when you had to adapt quickly to a change in someone's care needs or circumstances."

FINAL QUESTIONS:
- "Why are you interested in working with people who have complex needs and challenging behaviors?"

- "How do you maintain your own wellbeing when working in emotionally demanding care situations?"

3. For each answer, show empathy and ask relevant follow-ups like "How did that experience shape your approach to care?" or "What would you do differently in that situation today?"

4. End with: "Thank you for sharing your experiences. The recruitment team will review this interview and contact you within 2-3 business days. Do you have any questions about working at Harley Jai Care?"

INTERVIEW STYLE:
- Be warm, professional, and understanding
- Show genuine interest in their care experience
- Ask follow-up questions about specific techniques or approaches
- Acknowledge the challenging nature of care work
- Focus on their motivation and suitability for complex care

IMPORTANT: Ask only ONE question at a time and wait for their complete response before continuing.`,
      properties: {
        max_call_duration: 2400, // 40 minutes max
        participant_left_timeout: 300, // 5 minutes timeout
        participant_absent_timeout: 600, // 10 minutes if they don't join
        enable_recording: true,
        enable_transcription: true
      }
    };

    console.log('🐋 Creating Tavus conversation...');
    
    const tavusResponse = await axios.post(
      'https://tavusapi.com/v2/conversations',
      tavusPayload,
      {
        headers: {
          'x-api-key': process.env.TAVUS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const conversationId = tavusResponse.data.conversation_id;
    const conversationUrl = tavusResponse.data.conversation_url;
    
    console.log('✅ Tavus conversation created:', conversationId);

    // 3. Store conversation details in Google Sheet
    if (row) {
      const conversationDetails = [
        [conversationId, conversationUrl, new Date().toISOString()]
      ];
      const detailsRange = `'Call Queue'!Q${row}:S${row}`; // Q: Conversation ID, R: URL, S: Date Sent
      await updateSheet(process.env.GOOGLE_SHEET_ID, detailsRange, conversationDetails);
    }

    // 4. Prepare email content
    const emailSubject = `Video Interview Invitation - Care Assistant Position`;
    const emailBody = `Dear ${candidateName},

Congratulations! You've successfully passed our phone screening and technical interview stages.

We'd now like to invite you to complete a video interview with our AI interviewer, WhaleAgent. This will be a 20-30 minute conversation focusing on your experience with care work and behavioral questions.

🎥 Video Interview Link: ${conversationUrl}

Instructions:
• Click the link when you're ready to start
• Ensure you have a stable internet connection and camera/microphone
• Find a quiet, well-lit space
• The interview will be recorded for evaluation purposes
• You can complete this at your convenience within the next 48 hours

What to expect:
• WhaleAgent will ask about your care experience and approach to challenging situations
• This is a conversation, so speak naturally and provide specific examples
• Take your time to think about your responses
• The interview focuses on empathy, professionalism, and care techniques

If you have any technical issues, please contact us at recruitment@harleyjicare.com.

Best of luck!

The Recruitment Team
Harley Jai Care

P.S. This interview assesses your suitability for working with individuals with complex needs, learning disabilities, and challenging behaviors. Please reflect on relevant experiences before starting.`;

    console.log('📧 Email content prepared for:', candidateEmail);

    res.json({
      status: 'Video interview invitation created',
      conversationId,
      conversationUrl,
      candidateName,
      candidateEmail,
      emailSubject,
      emailBody,
      message: 'Video interview link ready - send email manually or integrate with email service'
    });

  } catch (err) {
    console.error('==== WHALEAGENT TRIGGER ERROR ====');
    console.error('Error creating video interview:', err);
    
    if (err.response) {
      console.error('Tavus API Error:', err.response.data);
      res.status(500).json({
        error: 'Failed to create video interview',
        tavusError: err.response.data,
        details: err.message
      });
    } else {
      res.status(500).json({
        error: 'Failed to create video interview',
        details: err.message
      });
    }
  }
});

// WhaleAgent callback endpoint - Process completed video interview
app.post('/whaleagent-callback', async (req, res) => {
  try {
    console.log('==== WHALEAGENT CALLBACK RECEIVED ====');
    const payload = req.body;
    console.log('Tavus callback payload type:', payload.status || 'unknown');

    // Extract conversation details
    const conversationId = payload.conversation_id;
    const status = payload.status;
    const transcript = payload.transcript;
    const recordingUrl = payload.recording_url;

    if (status !== 'ended') {
      console.log(`⚠️ Conversation status: ${status}. Waiting for completion.`);
      return res.status(200).json({ message: `Conversation status: ${status}` });
    }

    if (!transcript) {
      console.log('⚠️ No transcript available in callback.');
      return res.status(200).json({ message: 'No transcript available' });
    }

    console.log('🐋 Processing WhaleAgent video interview...');
    console.log('Conversation ID:', conversationId);
    console.log('Transcript length:', transcript.length);

    // Find the row number by searching for the conversation ID in Google Sheets
    // For now, we'll need to implement a lookup or pass it differently
    // This is a simplified version - you may need to enhance this lookup
    
    // GPT Analysis for video interview
    const prompt = `You are WhaleAgent Video Interview Evaluator for a Care Assistant position at Harley Jai Care.

ROLE CONTEXT: This position involves providing personal care to individuals with complex needs, learning disabilities, and challenging behavior in Northern Ireland.

Analyze this behavioral interview transcript and provide a comprehensive assessment:

CORE COMPETENCIES (Score 1-5 each):
1. EMPATHY & COMPASSION (1-5): Genuine care for clients, emotional intelligence
2. PROFESSIONAL BOUNDARIES (1-5): Appropriate limits, confidentiality, integrity  
3. COMMUNICATION SKILLS (1-5): Clear, respectful interaction with clients and families
4. CRISIS MANAGEMENT (1-5): Handling challenging behaviors and emergencies
5. TEAMWORK & COLLABORATION (1-5): Working with care teams and professionals
6. SAFETY AWARENESS (1-5): Following protocols, medication handling, risk management
7. CULTURAL SENSITIVITY (1-5): Respect for diversity and individual needs
8. RESILIENCE & WELLBEING (1-5): Maintaining own mental health in demanding role

For each competency:
- Provide specific examples from their responses
- Note strengths and areas for development
- Highlight any red flags or concerns

OVERALL ASSESSMENT:
- Overall Score (1-5)
- Top 3 Strengths for care work
- Main areas for development
- Suitability for complex needs clients (High/Medium/Low)
- Cultural fit with Harley Jai Care values
- Final Recommendation: "Strongly Recommend", "Recommend", "Consider with reservations", or "Do Not Recommend"

SPECIFIC NOTES:
- Evidence of genuine motivation for care work
- Experience with learning disabilities/challenging behavior
- Understanding of professional care standards
- Emotional maturity for the role

TRANSCRIPT:
${transcript}

Provide a detailed, professional assessment suitable for the recruitment team.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const videoAnalysis = completion.choices[0].message.content;
    console.log('✅ WhaleAgent video analysis generated');

    // Extract overall score
    let overallScore = '';
    const scoreMatch = videoAnalysis.match(/overall score.*?([1-5])/i);
    if (scoreMatch) {
      overallScore = scoreMatch[1];
    }

    // For now, let's assume we can find the row by searching Google Sheets
    // In a production system, you'd implement proper conversation ID lookup
    const row = await findRowByConversationId(conversationId); // You'll need to implement this
    
    if (row) {
      // Video Interview columns: T: Transcript, U: Score, V: Analysis, W: Recording URL
      const range = `'Call Queue'!T${row}:W${row}`;
      const values = [[transcript, overallScore, videoAnalysis, recordingUrl || '']];
      await updateSheet(process.env.GOOGLE_SHEET_ID, range, values);

      // Update status to Video Completed
      const statusRange = `'Call Queue'!P${row}`;
      await updateSheet(process.env.GOOGLE_SHEET_ID, statusRange, [['Video Completed']]);

      console.log('✅ WhaleAgent callback processed and sheet updated');
    }

    // Upload analysis to SharePoint (optional)
    try {
      const analysisFileName = `WhaleAgent_Analysis_${conversationId}_${Date.now()}.txt`;
      const analysisBuffer = Buffer.from(`WHALEAGENT VIDEO INTERVIEW ANALYSIS\n\nConversation ID: ${conversationId}\nDate: ${new Date().toISOString()}\n\n${videoAnalysis}`, 'utf8');
      
      const uploadResp = await uploadToSharePoint(analysisBuffer, analysisFileName);
      console.log('✅ Video analysis uploaded to SharePoint');
    } catch (uploadError) {
      console.log('⚠️ Failed to upload to SharePoint:', uploadError.message);
    }

    res.json({
      message: 'WhaleAgent video interview processed successfully',
      conversationId,
      overallScore,
      analysisLength: videoAnalysis.length,
      recordingUrl: recordingUrl || 'Not available'
    });

  } catch (err) {
    console.error('==== WHALEAGENT CALLBACK ERROR ====');
    console.error('Error processing video interview:', err);
    res.status(500).json({
      error: 'Failed to process video interview',
      details: err.message
    });
  }
});

// Helper function to find row by conversation ID (you'll need to implement this)
async function findRowByConversationId(conversationId) {
  try {
    // This is a placeholder - you'll need to implement the actual lookup
    // You could search column Q for the conversation ID and return the row number
    
    // For now, return a placeholder
    console.log(`🔍 Need to implement lookup for conversation ID: ${conversationId}`);
    return null; // Return actual row number when found
  } catch (error) {
    console.error('Error finding row by conversation ID:', error);
    return null;
  }
}
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    endpoints: [
      'GET / - Server status',
      'POST /webhook - SharePoint file upload',
      'POST /zebraagent-trigger - Phone screening',
      'POST /lionagent-trigger - Technical interview',
      'POST /whaleagent-trigger - Video behavioral interview',
      'POST /vapi-callback - Process phone/tech calls',
      'POST /whaleagent-callback - Process video interviews',
      'GET /health - Health check'
    ],
    environment: {
      hasHubspotToken: !!process.env.HUBSPOT_TOKEN,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      hasGoogleSheetId: !!process.env.GOOGLE_SHEET_ID,
      hasSharePointConfig: !!(process.env.SP_CLIENT_ID && process.env.SP_TENANT_ID),
      hasVapiKey: !!process.env.VAPI_API_KEY,
      hasVapiAssistantId: !!process.env.VAPI_ASSISTANT_ID,
      hasLionAgentAssistantId: !!process.env.LIONAGENT_VAPI_ASSISTANT_ID,
      hasLionAgentPhoneId: !!process.env.LIONAGENT_PHONE_NUMBER_ID,
      hasTavusApiKey: !!process.env.TAVUS_API_KEY,
      hasTavusPersonaId: !!process.env.TAVUS_PERSONA_ID,
      hasTavusReplicaId: !!process.env.TAVUS_REPLICA_ID
    }
  });
});

// Catch-all for undefined routes
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl,
    availableRoutes: [
      'GET /',
      'GET /health',
      'POST /webhook',
      'POST /zebraagent-trigger',
      'POST /lionagent-trigger',
      'POST /whaleagent-trigger',
      'POST /vapi-callback',
      'POST /whaleagent-callback'
    ],
    timestamp: new Date().toISOString()
  });
});

// ===========================================
// SERVER STARTUP
// ===========================================

module.exports = app;