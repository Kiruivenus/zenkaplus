/* ==========================================================================
   NYOTA CASH - BACKEND SERVER
   Serves static files + M-Pesa Daraja STK Push API integration
   No external npm dependencies - uses Node.js built-in modules only
   ========================================================================== */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const os    = require('os');

// ==========================================================================
// 1. LOAD & PARSE .env FILE MANUALLY (no external dotenv dependency)
// ==========================================================================
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.warn('[ENV] Warning: .env file not found. Using process.env values only.');
    return;
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key   = trimmed.substring(0, eqIndex).trim();
    const value = trimmed.substring(eqIndex + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
  console.log('[ENV] .env file loaded successfully.');
}

loadEnv();

// ==========================================================================
// 2. CONFIGURATION FROM ENV
// ==========================================================================
const PORT                   = parseInt(process.env.PORT || '3000', 10);
const MPESA_CONSUMER_KEY     = process.env.MPESA_CONSUMER_KEY     || '';
const MPESA_CONSUMER_SECRET  = process.env.MPESA_CONSUMER_SECRET  || '';
const MPESA_SHORTCODE        = process.env.MPESA_SHORTCODE        || '174379';
const MPESA_PARTYB           = process.env.MPESA_PARTYB           || process.env.MPESA_SHORTCODE || '174379';
const MPESA_PASSKEY          = process.env.MPESA_PASSKEY          || '';
const MPESA_TRANSACTION_TYPE = process.env.MPESA_TRANSACTION_TYPE || 'CustomerBuyGoodsOnline';
const MPESA_CALLBACK_URL     = process.env.MPESA_CALLBACK_URL     || '';

const DARAJA_SANDBOX_BASE    = 'sandbox.safaricom.co.ke';

// ==========================================================================
// 3. PERSISTENT TRANSACTION STATE STORE (via os.tmpdir() for serverless)
// ==========================================================================
const TX_FILE = path.join(os.tmpdir(), 'nyotacash_tx.json');

function getTransaction(checkoutRequestId) {
  try {
    if (fs.existsSync(TX_FILE)) {
      const store = JSON.parse(fs.readFileSync(TX_FILE, 'utf-8'));
      return store[checkoutRequestId];
    }
  } catch (err) {
    console.error('[STORE] Error reading transaction:', err.message);
  }
  return null;
}

function setTransaction(checkoutRequestId, data) {
  try {
    let store = {};
    if (fs.existsSync(TX_FILE)) {
      store = JSON.parse(fs.readFileSync(TX_FILE, 'utf-8'));
    }
    store[checkoutRequestId] = {
      ...(store[checkoutRequestId] || {}),
      ...data,
      updatedAt: Date.now()
    };
    fs.writeFileSync(TX_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('[STORE] Error writing transaction:', err.message);
  }
}

// ==========================================================================
// 4. UTILITY HELPERS
// ==========================================================================
const MIME_TYPES = {
  '.html': 'text/html',
  '.css' : 'text/css',
  '.js'  : 'text/javascript',
  '.json': 'application/json',
  '.png' : 'image/png',
  '.jpg' : 'image/jpeg',
  '.gif' : 'image/gif',
  '.svg' : 'image/svg+xml',
  '.ico' : 'image/x-icon'
};

function sendJSON(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type' : 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk.toString(); });
    req.on('end',  ()    => {
      try { resolve(JSON.parse(data)); }
      catch (_) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (_) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ==========================================================================
// 5. DARAJA API METHODS
// ==========================================================================

/** Fetch OAuth access token from Safaricom Daraja */
async function getDarajaToken() {
  const credentials = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
  const result = await httpsRequest({
    hostname: DARAJA_SANDBOX_BASE,
    path    : '/oauth/v1/generate?grant_type=client_credentials',
    method  : 'GET',
    headers : {
      'Authorization': `Basic ${credentials}`,
      'Content-Type' : 'application/json'
    }
  });
  if (!result.data.access_token) {
    throw new Error(`Daraja OAuth failed: ${JSON.stringify(result.data)}`);
  }
  return result.data.access_token;
}

/** Build Base64-encoded Daraja password and generate current timestamp */
function buildPasswordAndTimestamp() {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-T:.Z]/g, '')
    .slice(0, 14); // YYYYMMDDHHmmss
  const password  = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');
  return { password, timestamp };
}

/** Initiate STK Push on Safaricom Daraja */
async function initiateStkPush(token, phoneRaw, amountKsh) {
  const { password, timestamp } = buildPasswordAndTimestamp();

  // Normalize phone to 254XXXXXXXXX format
  let phone = phoneRaw.replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '254' + phone.slice(1);
  if (!phone.startsWith('254')) phone = '254' + phone;

  const payload = JSON.stringify({
    BusinessShortCode: MPESA_SHORTCODE,
    Password          : password,
    Timestamp         : timestamp,
    TransactionType   : MPESA_TRANSACTION_TYPE,
    Amount            : Math.max(1, Math.ceil(amountKsh)),  // Safaricom minimum is KES 1
    PartyA            : phone,
    PartyB            : MPESA_PARTYB,
    PhoneNumber       : phone,
    CallBackURL       : MPESA_CALLBACK_URL,
    AccountReference  : 'NyotaCashExcise',
    TransactionDesc   : 'Excise Duty - Nyota Cash Loan'
  });

  const result = await httpsRequest({
    hostname: DARAJA_SANDBOX_BASE,
    path    : '/mpesa/stkpush/v1/processrequest',
    method  : 'POST',
    headers : {
      'Authorization': `Bearer ${token}`,
      'Content-Type' : 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, payload);

  return result.data;
}

// ==========================================================================
// 6. API ROUTE HANDLERS
// ==========================================================================

/** POST /api/request-stk — Authenticate + initiate STK Push */
async function handleRequestStk(req, res) {
  const body = await readBody(req);
  const { phone, amount } = body;

  if (!phone || !amount) {
    return sendJSON(res, 400, { success: false, message: 'Missing phone or amount.' });
  }

  if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET) {
    return sendJSON(res, 500, { success: false, message: 'Missing M-Pesa API Consumer Key or Secret in .env configuration.' });
  }

  try {
    const token  = await getDarajaToken();
    const result = await initiateStkPush(token, phone, amount);

    // Safaricom returns ResponseCode "0" on successful STK initiation
    if (result.ResponseCode !== '0') {
      console.error('[STK] Daraja push initiation rejected by Safaricom:', result);
      return sendJSON(res, 502, { 
        success: false, 
        message: result.CustomerMessage || result.errorMessage || `Safaricom rejected the request (ResponseCode ${result.ResponseCode}).` 
      });
    }

    const checkoutRequestId = result.CheckoutRequestID;

    // Persist initial pending state in transaction store
    setTransaction(checkoutRequestId, {
      status      : 'pending',
      resultCode  : null,
      resultDesc  : null,
      amount      : amount,
      phone       : phone,
      createdAt   : Date.now()
    });

    console.log(`[STK] Push initiated successfully. CheckoutRequestID: ${checkoutRequestId}`);
    return sendJSON(res, 200, {
      success          : true,
      checkoutRequestId: checkoutRequestId,
      customerMessage  : result.CustomerMessage
    });

  } catch (err) {
    console.error('[STK] Exception while initiating STK push:', err.message);
    return sendJSON(res, 500, { success: false, message: `Failed to initiate STK Push: ${err.message}` });
  }
}

/** POST /api/mpesa-callback — Safaricom sends payment result here */
async function handleMpesaCallback(req, res) {
  const body = await readBody(req);

  try {
    const stkCallback = body?.Body?.stkCallback;
    if (!stkCallback) {
      console.warn('[CALLBACK] Malformed callback body received:', JSON.stringify(body));
      return sendJSON(res, 400, { ResultCode: 1, ResultDesc: 'Malformed callback' });
    }

    const { CheckoutRequestID, ResultCode, ResultDesc } = stkCallback;
    const entry = getTransaction(CheckoutRequestID);

    if (!entry) {
      console.warn(`[CALLBACK] Unknown CheckoutRequestID: ${CheckoutRequestID}`);
      // Still respond 200 so Safaricom doesn't retry
      return sendJSON(res, 200, { ResultCode: 0, ResultDesc: 'Accepted' });
    }

    entry.resultCode = ResultCode;
    entry.resultDesc = ResultDesc;
    entry.status     = ResultCode === 0 ? 'success' : 'failed';

    setTransaction(CheckoutRequestID, entry);

    console.log(`[CALLBACK] Payment ${entry.status} for ${CheckoutRequestID}. Code: ${ResultCode} | ${ResultDesc}`);
    return sendJSON(res, 200, { ResultCode: 0, ResultDesc: 'Accepted' });

  } catch (err) {
    console.error('[CALLBACK] Error processing callback:', err.message);
    return sendJSON(res, 500, { ResultCode: 1, ResultDesc: 'Server Error' });
  }
}

/** GET /api/check-payment-status?checkoutRequestId=XXX — Frontend polls this */
function handleCheckPaymentStatus(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const checkoutRequestId = parsedUrl.query.checkoutRequestId;

  if (!checkoutRequestId) {
    return sendJSON(res, 400, { success: false, message: 'Missing checkoutRequestId parameter.' });
  }

  const entry = getTransaction(checkoutRequestId);
  if (!entry) {
    return sendJSON(res, 404, { success: false, message: 'Transaction not found.' });
  }

  return sendJSON(res, 200, {
    success    : true,
    status     : entry.status,
    resultCode : entry.resultCode,
    resultDesc : entry.resultDesc,
    amount     : entry.amount,
    phone      : entry.phone
  });
}

/** POST /api/mock-callback — Dev-only: simulate Safaricom callback locally */
async function handleMockCallback(req, res) {
  const body = await readBody(req);
  const { checkoutRequestId, success } = body;

  if (!checkoutRequestId) {
    return sendJSON(res, 400, { success: false, message: 'Missing checkoutRequestId.' });
  }

  let entry = getTransaction(checkoutRequestId);
  if (!entry) {
    // Dynamically initialize mock transaction if it doesn't exist
    entry = {
      status      : 'pending',
      resultCode  : null,
      resultDesc  : null,
      amount      : 0,
      phone       : '',
      createdAt   : Date.now()
    };
    setTransaction(checkoutRequestId, entry);
  }

  if (success === false) {
    entry.status     = 'failed';
    entry.resultCode = 1032;
    entry.resultDesc = '[Mock] Request cancelled by user.';
  } else {
    entry.status     = 'success';
    entry.resultCode = 0;
    entry.resultDesc = '[Mock] The service request is processed successfully.';
  }

  setTransaction(checkoutRequestId, entry);

  console.log(`[MOCK-CALLBACK] Transaction ${checkoutRequestId} set to: ${entry.status}`);
  return sendJSON(res, 200, { success: true, status: entry.status });
}

// ==========================================================================
// 7. HTTP SERVER + ROUTER
// ==========================================================================
const requestHandler = async (req, res) => {
  const parsedUrl = url.parse(req.url);
  const pathname  = parsedUrl.pathname;
  const method    = req.method.toUpperCase();

  // --- API Routes ---
  if (pathname === '/api/request-stk' && method === 'POST') {
    return handleRequestStk(req, res);
  }
  if (pathname === '/api/mpesa-callback' && method === 'POST') {
    return handleMpesaCallback(req, res);
  }
  if (pathname === '/api/check-payment-status' && method === 'GET') {
    return handleCheckPaymentStatus(req, res);
  }
  if (pathname === '/api/mock-callback' && method === 'POST') {
    return handleMockCallback(req, res);
  }

  // --- Static File Serving ---
  let decodedPath;
  try { decodedPath = decodeURIComponent(pathname); }
  catch (_) { decodedPath = pathname; }

  let filePath = decodedPath === '/' ? '/index.html' : decodedPath;
  filePath = path.join(__dirname, '..', filePath);

  const normalizedFile = path.normalize(filePath);
  const normalizedDir  = path.normalize(path.join(__dirname, '..'));

  if (!normalizedFile.startsWith(normalizedDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  const ext         = path.extname(normalizedFile);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(normalizedFile, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`500 Internal Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, {
        'Content-Type' : contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma'       : 'no-cache',
        'Expires'      : '0'
      });
      res.end(content, 'utf-8');
    }
  });
};

const server = http.createServer(requestHandler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(` Nyota Cash server successfully started!`);
    console.log(` Local access: http://localhost:${PORT}`);
    console.log(`\n API Endpoints:`);
    console.log(`   POST /api/request-stk          → Initiate STK Push`);
    console.log(`   POST /api/mpesa-callback        → Safaricom payment callback`);
    console.log(`   GET  /api/check-payment-status  → Poll transaction status`);
    console.log(`   POST /api/mock-callback         → Dev-only: simulate callback`);
    console.log(`==================================================\n`);
  });
}

module.exports = requestHandler;
module.exports.server = server;
module.exports.PORT = PORT;
