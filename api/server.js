/* ==========================================================================
   Zenka Plus - BACKEND SERVER
   Serves static files + M-Pesa Daraja STK Push API integration
   No external npm dependencies - uses Node.js built-in modules only
   ========================================================================== */

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');
const os    = require('os');

let MongoClient;
try {
  MongoClient = require('mongodb').MongoClient;
} catch (e) {
  console.warn('[MONGO] MongoDB package not loaded yet. Fallback mode will be used.');
}

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

const DARAJA_LIVE_BASE       = 'api.safaricom.co.ke';

// Dynamic configuration cache
const dynamicConfig = {
  MPESA_PARTYB: null,
  EXCISE_DUTY: null
};
let db = null;
let mongoClient = null;
let isMongoConnected = false;

const MONGODB_URI = process.env.MONGODB_URI;

async function loadDynamicConfig() {
  if (isMongoConnected && db) {
    try {
      const configCol = db.collection('config');
      
      const partyBConfig = await configCol.findOne({ key: 'MPESA_PARTYB' });
      if (partyBConfig) {
        dynamicConfig.MPESA_PARTYB = partyBConfig.value;
        console.log(`[CONFIG] Loaded dynamic MPESA_PARTYB from DB: ${dynamicConfig.MPESA_PARTYB}`);
      }
      
      const exciseConfig = await configCol.findOne({ key: 'EXCISE_DUTY' });
      if (exciseConfig) {
        dynamicConfig.EXCISE_DUTY = parseInt(exciseConfig.value, 10);
        console.log(`[CONFIG] Loaded dynamic EXCISE_DUTY from DB: ${dynamicConfig.EXCISE_DUTY}`);
      }
    } catch (err) {
      console.error('[CONFIG] Error loading dynamic config from DB:', err.message);
    }
  } else {
    try {
      const configFile = path.join(os.tmpdir(), 'ZenkaPlus_config.json');
      if (fs.existsSync(configFile)) {
        const cfg = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        if (cfg.MPESA_PARTYB) {
          dynamicConfig.MPESA_PARTYB = cfg.MPESA_PARTYB;
          console.log(`[CONFIG] Loaded local dynamic MPESA_PARTYB: ${dynamicConfig.MPESA_PARTYB}`);
        }
        if (cfg.EXCISE_DUTY) {
          dynamicConfig.EXCISE_DUTY = parseInt(cfg.EXCISE_DUTY, 10);
          console.log(`[CONFIG] Loaded local dynamic EXCISE_DUTY: ${dynamicConfig.EXCISE_DUTY}`);
        }
      }
    } catch (err) {
      console.error('[CONFIG] Error loading local config:', err.message);
    }
  }
}

function getMpesaPartyB() {
  return dynamicConfig.MPESA_PARTYB || MPESA_PARTYB;
}

function getExciseDuty() {
  return dynamicConfig.EXCISE_DUTY || parseInt(process.env.EXCISE_DUTY || '187', 10);
}

async function connectToMongo() {
  if (isMongoConnected && db && mongoClient) {
    return;
  }
  if (!MongoClient) {
    console.warn('[MONGO] MongoDB client not available. Operating in local fallback (JSON-file) mode.');
    await loadDynamicConfig();
    return;
  }
  if (!MONGODB_URI) {
    console.warn('[MONGO] MONGODB_URI not configured in env. Operating in local fallback (JSON-file) mode.');
    await loadDynamicConfig();
    return;
  }
  try {
    mongoClient = new MongoClient(MONGODB_URI, {
      connectTimeoutMS: 5000,
      socketTimeoutMS: 5000
    });
    await mongoClient.connect();
    db = mongoClient.db();
    isMongoConnected = true;
    console.log('[MONGO] Connected successfully to MongoDB.');
    await loadDynamicConfig();
  } catch (err) {
    console.error('[MONGO] Connection failed:', err.message);
    isMongoConnected = false;
    db = null;
    await loadDynamicConfig();
  }
}

// ==========================================================================
// 3. PERSISTENT TRANSACTION STATE STORE (via os.tmpdir() for serverless)
// ==========================================================================
const TX_FILE = path.join(os.tmpdir(), 'ZenkaPlus_tx.json');

async function getTransaction(checkoutRequestId) {
  if (isMongoConnected && db) {
    try {
      const tx = await db.collection('transactions').findOne({ checkoutRequestId });
      return tx;
    } catch (err) {
      console.error('[MONGO] Error getting transaction:', err.message);
    }
  }
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

async function setTransaction(checkoutRequestId, data) {
  if (isMongoConnected && db) {
    try {
      await db.collection('transactions').updateOne(
        { checkoutRequestId },
        { 
          $set: {
            ...data,
            checkoutRequestId,
            updatedAt: Date.now()
          } 
        },
        { upsert: true }
      );
      return;
    } catch (err) {
      console.error('[MONGO] Error setting transaction:', err.message);
    }
  }
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

/** Scan for a recent successful transaction matching phone number (within 24 hours) */
async function findRecentSuccessfulTransaction(phone) {
  const cleanPhone = phone.replace(/[\s\+]/g, '');
  let matchNumber = cleanPhone;
  if (cleanPhone.startsWith('254') && cleanPhone.length > 9) {
    matchNumber = cleanPhone.substring(3);
  } else if (cleanPhone.startsWith('0') && cleanPhone.length > 9) {
    matchNumber = cleanPhone.substring(1);
  }

  if (isMongoConnected && db) {
    try {
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const tx = await db.collection('transactions').findOne({
        status: 'success',
        createdAt: { $gt: oneDayAgo },
        $or: [
          { phone: new RegExp(matchNumber + '$') },
          { phone: phone }
        ]
      });
      if (tx) return tx;
    } catch (err) {
      console.error('[MONGO] Error finding recent successful transaction:', err.message);
    }
  }

  try {
    if (fs.existsSync(TX_FILE)) {
      const store = JSON.parse(fs.readFileSync(TX_FILE, 'utf-8'));
      for (const checkoutId in store) {
        const tx = store[checkoutId];
        const txPhone = (tx.phone || '').replace(/[\s\+]/g, '');
        let cleanTxPhone = txPhone;
        if (txPhone.startsWith('254') && txPhone.length > 9) {
          cleanTxPhone = txPhone.substring(3);
        } else if (txPhone.startsWith('0') && txPhone.length > 9) {
          cleanTxPhone = txPhone.substring(1);
        }
        
        if (tx.status === 'success' && cleanTxPhone === matchNumber && matchNumber.length >= 9) {
          if (Date.now() - (tx.createdAt || 0) < 24 * 60 * 60 * 1000) {
            return { checkoutRequestId: checkoutId, ...tx };
          }
        }
      }
    }
  } catch (err) {
    console.error('[STORE] Error finding recent transaction:', err.message);
  }
  return null;
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
    hostname: DARAJA_LIVE_BASE,
    path    : '/oauth/v1/generate?grant_type=client_credentials',
    method  : 'GET',
    headers : {
      'Authorization': `Basic ${credentials}`,
      'Content-Type' : 'application/json',
      'User-Agent'   : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept'       : 'application/json',
      'Connection'   : 'keep-alive'
    }
  });
  if (!result.data.access_token) {
    const rawDataStr = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
    if (rawDataStr.includes('<html') || rawDataStr.includes('Incapsula') || rawDataStr.includes('incident_id')) {
      throw new Error('Daraja API blocked by Incapsula CDN/WAF DDoS protection. Please check server IP reputation.');
    }
    throw new Error(`Daraja OAuth failed: ${rawDataStr}`);
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
async function initiateStkPush(token, phoneRaw, amountKsh, callbackUrl) {
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
    PartyB            : getMpesaPartyB(),
    PhoneNumber       : phone,
    CallBackURL       : callbackUrl,
    AccountReference  : 'ZenkaPlusExcise',
    TransactionDesc   : 'Excise Duty - ZenkaPlus Loan'
  });

  const result = await httpsRequest({
    hostname: DARAJA_LIVE_BASE,
    path    : '/mpesa/stkpush/v1/processrequest',
    method  : 'POST',
    headers : {
      'Authorization': `Bearer ${token}`,
      'Content-Type' : 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent'   : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept'       : 'application/json',
      'Connection'   : 'keep-alive'
    }
  }, payload);

  return result.data;
}

// ==========================================================================
// 6. API ROUTE HANDLERS
// ==========================================================================

/** POST /api/request-stk â€” Authenticate + initiate STK Push */
async function handleRequestStk(req, res) {
  const body = await readBody(req);
  const { phone, amount } = body;
  if (!phone || !amount) {
    return sendJSON(res, 400, { success: false, message: 'Missing phone or amount.' });
  }

  // Check if there is already a successful transaction for this phone number
  const recentTx = await findRecentSuccessfulTransaction(phone);
  if (recentTx) {
    console.log(`[STK] Found recent successful transaction for ${phone}: ${recentTx.checkoutRequestId}`);
    return sendJSON(res, 200, {
      success          : true,
      alreadyPaid      : true,
      checkoutRequestId: recentTx.checkoutRequestId,
      customerMessage  : 'Excise duty has already been paid for this application.'
    });
  }

  const isDemoMode = !MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET || body.demo === true || body.demo === 'true';

  if (isDemoMode) {
    // Demo Mode: Mock STK initiation and schedule a mock callback after 8 seconds
    const mockCheckoutRequestId = `ws_CO_${Date.now()}`;
    await setTransaction(mockCheckoutRequestId, {
      status      : 'pending',
      resultCode  : null,
      resultDesc  : null,
      amount      : amount,
      phone       : phone,
      createdAt   : Date.now()
    });

    console.log(`[STK-DEMO] Demo mode: Initiated mock STK. CheckoutRequestID: ${mockCheckoutRequestId}`);
    
    // Schedule a mock callback update after 8 seconds (70% success, 30% user cancel)
    setTimeout(async () => {
      const isSuccess = Math.random() > 0.3;
      const resultCode = isSuccess ? 0 : 1032;
      const resultDesc = isSuccess 
        ? '[Mock] The service request is processed successfully.' 
        : '[Mock] Request cancelled by user.';
      
      const entry = await getTransaction(mockCheckoutRequestId);
      if (entry) {
        entry.resultCode = resultCode;
        entry.resultDesc = resultDesc;
        entry.status = resultCode === 0 ? 'success' : (resultCode === 1032 ? 'cancelled' : 'failed');
        await setTransaction(mockCheckoutRequestId, entry);
        console.log(`[STK-DEMO-CALLBACK] Auto-callback fired for ${mockCheckoutRequestId}: ${entry.status}`);
      }
    }, 8000);

    return sendJSON(res, 200, {
      success          : true,
      checkoutRequestId: mockCheckoutRequestId,
      customerMessage  : 'Success. Request accepted for processing (Demo Mode).'
    });
  }

  try {
    const token  = await getDarajaToken();

    // Determine callback URL dynamically based on host header to prevent ngrok configuration drops
    const host = req.headers.host || '';
    let callbackUrl = MPESA_CALLBACK_URL;
    if (!callbackUrl || callbackUrl.includes('your-public-domain.ngrok-free.app') || (callbackUrl.includes('localhost') && !host.includes('localhost'))) {
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      callbackUrl = `${protocol}://${host}/api/mpesa-callback`;
    }
    console.log(`[STK] Using callback URL: ${callbackUrl}`);

    const result = await initiateStkPush(token, phone, amount, callbackUrl);

    // Check if result is blocked by CDN/Incapsula (HTML response returned)
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    if (resultStr.includes('<html') || resultStr.includes('Incapsula') || resultStr.includes('incident_id')) {
      console.warn('[STK] Safaricom WAF blocked outgoing STK push request (Incapsula DDoS protection). Please ensure your server IP is whitelisted or use Demo Mode for smooth simulation.');
      return sendJSON(res, 502, {
        success: false,
        message: 'M-Pesa connection was blocked by Safaricom WAF/DDoS protection. Please try again or use Demo Mode for smooth simulation.'
      });
    }

    // Safaricom returns ResponseCode "0" on successful STK initiation
    if (result.ResponseCode !== '0') {
      const displayMsg = typeof result === 'object' ? (result.CustomerMessage || result.errorMessage) : null;
      console.error('[STK] Daraja push initiation rejected by Safaricom:', result);
      return sendJSON(res, 502, { 
        success: false, 
        message: displayMsg || `Safaricom rejected the request (ResponseCode ${result.ResponseCode}).` 
      });
    }

    const checkoutRequestId = result.CheckoutRequestID;

    // Persist initial pending state in transaction store
    await setTransaction(checkoutRequestId, {
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
    if (err.message.includes('Incapsula') || err.message.includes('blocked by Incapsula')) {
      console.warn('[STK] Safaricom WAF blocked outgoing STK push request (Incapsula DDoS protection).');
      return sendJSON(res, 502, { 
        success: false, 
        message: 'M-Pesa connection was blocked by Safaricom WAF/DDoS protection. Please try again or use Demo Mode for smooth simulation.' 
      });
    }
    console.error('[STK] Exception while initiating STK push:', err.message);
    return sendJSON(res, 500, { success: false, message: `Failed to initiate STK Push: ${err.message}` });
  }
}

/** POST /api/mpesa-callback â€” Safaricom sends payment result here */
async function handleMpesaCallback(req, res) {
  const body = await readBody(req);

  try {
    const stkCallback = body?.Body?.stkCallback;
    if (!stkCallback) {
      console.warn('[CALLBACK] Malformed callback body received:', JSON.stringify(body));
      return sendJSON(res, 400, { ResultCode: 1, ResultDesc: 'Malformed callback' });
    }

    const { CheckoutRequestID, ResultCode, ResultDesc } = stkCallback;
    let entry = await getTransaction(CheckoutRequestID);

    if (!entry) {
      console.warn(`[CALLBACK] CheckoutRequestID ${CheckoutRequestID} not found in store, creating new entry.`);
      entry = {
        amount: 0,
        phone: '',
        createdAt: Date.now()
      };
    }

    entry.resultCode = ResultCode;
    entry.resultDesc = ResultDesc;
    
    // Map various Safaricom ResultCodes to explicit status values
    if (ResultCode === 0) {
      entry.status = 'success';
    } else if (ResultCode === 1032) {
      entry.status = 'cancelled';
    } else {
      entry.status = 'failed';
    }

    await setTransaction(CheckoutRequestID, entry);

    console.log(`[CALLBACK] Payment ${entry.status} for ${CheckoutRequestID}. Code: ${ResultCode} | ${ResultDesc}`);
    return sendJSON(res, 200, { ResultCode: 0, ResultDesc: 'Accepted' });

  } catch (err) {
    console.error('[CALLBACK] Error processing callback:', err.message);
    return sendJSON(res, 500, { ResultCode: 1, ResultDesc: 'Server Error' });
  }
}

/** Query Safaricom Daraja for the real-time status of an STK push */
async function queryDarajaStkStatus(checkoutRequestId) {
  if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET) {
    return null;
  }
  try {
    const token = await getDarajaToken();
    const { password, timestamp } = buildPasswordAndTimestamp();
    const payload = JSON.stringify({
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    });

    console.log(`[STK-QUERY] Querying Daraja API for status of CheckoutRequestID: ${checkoutRequestId}`);
    const result = await httpsRequest({
      hostname: DARAJA_LIVE_BASE,
      path    : '/mpesa/stkpushquery/v1/query',
      method  : 'POST',
      headers : {
        'Authorization': `Bearer ${token}`,
        'Content-Type' : 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent'   : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept'       : 'application/json',
        'Connection'   : 'keep-alive'
      }
    }, payload);

    if (result.status === 200 && result.data) {
      const { ResponseCode, ResultCode, ResultDesc } = result.data;
      if (ResponseCode === '0') {
        const resultCodeNum = parseInt(ResultCode, 10);
        const descLower = (ResultDesc || '').toLowerCase();
        
        let status = 'failed';
        if (resultCodeNum === 0) {
          status = 'success';
        } else if (resultCodeNum === 1032) {
          status = 'cancelled';
        } else if (resultCodeNum === 4999 || descLower.includes('processing') || descLower.includes('progress') || descLower.includes('pending')) {
          status = 'pending';
        }
        
        return {
          status: status,
          resultCode: resultCodeNum,
          resultDesc: ResultDesc
        };
      }
    } else {
      const errData = result.data;
      const errDataStr = typeof errData === 'string' ? errData : JSON.stringify(errData);
      const errMsg = errData?.errorMessage || errData?.message || '';
      if (errMsg.includes('processing') || errMsg.includes('progress') || result.status === 500) {
        console.log(`[STK-QUERY] Daraja status query indicates still pending/processing (HTTP ${result.status}).`);
        return { status: 'pending', resultCode: null, resultDesc: 'Transaction is being processed' };
      }
      if (errDataStr.includes('<html') || errDataStr.includes('Incapsula') || errDataStr.includes('incident_id')) {
        console.warn(`[STK-QUERY] Daraja status query rejected (HTTP ${result.status}): Blocked by CDN/Incapsula DDoS protection.`);
      } else if (result.status === 429) {
        console.warn(`[STK-QUERY] Daraja status query rejected (HTTP 429): Safaricom Daraja API Spike Arrest / Rate Limit exceeded.`);
      } else {
        console.warn(`[STK-QUERY] Daraja status query rejected (HTTP ${result.status}):`, errDataStr);
      }
    }
  } catch (err) {
    if (err.message.includes('Incapsula') || err.message.includes('blocked by Incapsula')) {
      console.warn('[STK-QUERY] Daraja status query failed: Safaricom WAF blocked our outgoing query (Incapsula DDoS protection). The flow will successfully proceed once the incoming Safaricom payment callback is received.');
    } else {
      console.error('[STK-QUERY] Exception during Daraja status query:', err.message);
    }
  }
  return null;
}

/** GET /api/check-payment-status?checkoutRequestId=XXX â€” Frontend polls this */
async function handleCheckPaymentStatus(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const checkoutRequestId = parsedUrl.query.checkoutRequestId;
  const phone = parsedUrl.query.phone;

  if (!checkoutRequestId && !phone) {
    return sendJSON(res, 400, { success: false, message: 'Missing checkoutRequestId or phone parameter.' });
  }

  // If phone is provided, we can look up if they paid
  if (phone) {
    const recentTx = await findRecentSuccessfulTransaction(phone);
    if (recentTx) {
      return sendJSON(res, 200, {
        success: true,
        status: 'success',
        checkoutRequestId: recentTx.checkoutRequestId,
        amount: recentTx.amount,
        phone: recentTx.phone,
        resultDesc: recentTx.resultDesc
      });
    }
    // If not successful and no checkout ID was passed, check pending
    if (!checkoutRequestId) {
      try {
        let pendingTx = null;
        if (isMongoConnected && db) {
          const cleanPhone = phone.replace(/[\s\+]/g, '');
          let matchNumber = cleanPhone;
          if (cleanPhone.startsWith('254') && cleanPhone.length > 9) {
            matchNumber = cleanPhone.substring(3);
          } else if (cleanPhone.startsWith('0') && cleanPhone.length > 9) {
            matchNumber = cleanPhone.substring(1);
          }
          pendingTx = await db.collection('transactions').findOne({
            status: 'pending',
            $or: [
              { phone: new RegExp(matchNumber + '$') },
              { phone: phone }
            ]
          });
        }
        
        if (pendingTx) {
          return sendJSON(res, 200, {
            success: true,
            status: 'pending',
            checkoutRequestId: pendingTx.checkoutRequestId,
            amount: pendingTx.amount,
            phone: pendingTx.phone
          });
        }

        if (fs.existsSync(TX_FILE)) {
          const store = JSON.parse(fs.readFileSync(TX_FILE, 'utf-8'));
          const cleanPhone = phone.replace(/[\s\+]/g, '');
          let matchNumber = cleanPhone;
          if (cleanPhone.startsWith('254') && cleanPhone.length > 9) {
            matchNumber = cleanPhone.substring(3);
          } else if (cleanPhone.startsWith('0') && cleanPhone.length > 9) {
            matchNumber = cleanPhone.substring(1);
          }

          for (const checkoutId in store) {
            const tx = store[checkoutId];
            const txPhone = (tx.phone || '').replace(/[\s\+]/g, '');
            let cleanTxPhone = txPhone;
            if (txPhone.startsWith('254') && txPhone.length > 9) {
              cleanTxPhone = txPhone.substring(3);
            } else if (txPhone.startsWith('0') && txPhone.length > 9) {
              cleanTxPhone = txPhone.substring(1);
            }

            if (tx.status === 'pending' && cleanTxPhone === matchNumber && matchNumber.length >= 9) {
              return sendJSON(res, 200, {
                success: true,
                status: 'pending',
                checkoutRequestId: checkoutId,
                amount: tx.amount,
                phone: tx.phone
              });
            }
          }
        }
      } catch (err) {
        console.error('[STORE] Error finding pending transaction:', err.message);
      }
      return sendJSON(res, 200, { success: false, status: 'none', message: 'No transaction found for this phone number.' });
    }
  }

  let entry = await getTransaction(checkoutRequestId);
  if (!entry) {
    // If not found in store but M-Pesa is configured, create a placeholder transaction and attempt background query
    if (MPESA_CONSUMER_KEY && MPESA_CONSUMER_SECRET) {
      console.log(`[STATUS] CheckoutRequestID ${checkoutRequestId} not found in store, creating pending entry.`);
      entry = {
        status: 'pending',
        resultCode: null,
        resultDesc: null,
        amount: 0,
        phone: '',
        createdAt: Date.now(),
        lastQueryTime: 0
      };
      await setTransaction(checkoutRequestId, entry);
    }
  }

  if (entry && entry.status === 'pending') {
    // If pending, query Safaricom to bypass Vercel statelessness callback issues
    if (MPESA_CONSUMER_KEY && MPESA_CONSUMER_SECRET) {
      const now = Date.now();
      const lastQuery = entry.lastQueryTime || 0;
      if (now - lastQuery >= 10000) { // Throttling: only query Safaricom once every 10 seconds
        entry.lastQueryTime = now;
        await setTransaction(checkoutRequestId, entry); // Save lastQueryTime first to prevent parallel requests

        const queried = await queryDarajaStkStatus(checkoutRequestId);
        if (queried) {
          if (queried.status !== 'pending') {
            entry.status = queried.status;
            entry.resultCode = queried.resultCode;
            entry.resultDesc = queried.resultDesc;
            console.log(`[STATUS] Transaction ${checkoutRequestId} status updated via background Daraja query: ${entry.status}`);
          }
          await setTransaction(checkoutRequestId, entry);
        }
      }
    }
  }

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

/** POST /api/mock-callback â€” Dev-only: simulate Safaricom callback locally */
async function handleMockCallback(req, res) {
  const body = await readBody(req);
  const { checkoutRequestId, success, status } = body;

  if (!checkoutRequestId) {
    return sendJSON(res, 400, { success: false, message: 'Missing checkoutRequestId.' });
  }

  let entry = await getTransaction(checkoutRequestId);
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
  }

  if (status) {
    if (status === 'success') {
      entry.status     = 'success';
      entry.resultCode = 0;
      entry.resultDesc = '[Mock] The service request is processed successfully.';
    } else if (status === 'cancelled') {
      entry.status     = 'cancelled';
      entry.resultCode = 1032;
      entry.resultDesc = '[Mock] Request cancelled by user.';
    } else if (status === 'wrong_pin') {
      entry.status     = 'failed';
      entry.resultCode = 2001;
      entry.resultDesc = '[Mock] The initiator entered the wrong PIN.';
    } else if (status === 'insufficient_funds') {
      entry.status     = 'failed';
      entry.resultCode = 1;
      entry.resultDesc = '[Mock] The initiator has insufficient balance to complete transaction.';
    } else {
      entry.status     = 'failed';
      entry.resultCode = 9999;
      entry.resultDesc = '[Mock] General transaction failure.';
    }
  } else {
    if (success === false) {
      entry.status     = 'failed';
      entry.resultCode = 1032;
      entry.resultDesc = '[Mock] Request cancelled by user.';
    } else {
      entry.status     = 'success';
      entry.resultCode = 0;
      entry.resultDesc = '[Mock] The service request is processed successfully.';
    }
  }

  await setTransaction(checkoutRequestId, entry);

  console.log(`[MOCK-CALLBACK] Transaction ${checkoutRequestId} set to: ${entry.status} (Code: ${entry.resultCode})`);
  return sendJSON(res, 200, { success: true, status: entry.status });
}

// ==========================================================================
// 6.5. ANALYTICS & ADMIN API HANDLERS
// ==========================================================================

async function handleTrackVisit(req, res) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  
  if (isMongoConnected && db) {
    try {
      await db.collection('visits').insertOne({
        ip,
        userAgent,
        timestamp: Date.now()
      });
    } catch (err) {
      console.error('[MONGO] Error tracking visit:', err.message);
    }
  } else {
    try {
      const visitsFile = path.join(os.tmpdir(), 'ZenkaPlus_visits.json');
      let visits = [];
      if (fs.existsSync(visitsFile)) {
        visits = JSON.parse(fs.readFileSync(visitsFile, 'utf-8'));
      }
      visits.push({ ip, userAgent, timestamp: Date.now() });
      fs.writeFileSync(visitsFile, JSON.stringify(visits, null, 2), 'utf-8');
    } catch (err) {
      console.error('[STORE] Error saving local visit:', err.message);
    }
  }
  return sendJSON(res, 200, { success: true });
}

async function handleAdminStats(req, res) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const requiredPasscode = process.env.ADMIN_PASSWORD || 'admin123';
  if (token !== requiredPasscode) {
    return sendJSON(res, 401, { success: false, message: 'Unauthorized' });
  }

  let totalVisits = 0;
  let totalSTK = 0;
  let totalPaid = 0;
  let totalFailed = 0;
  let totalAmountCollected = 0;
  let recentTransactions = [];

  if (isMongoConnected && db) {
    try {
      totalVisits = await db.collection('visits').countDocuments();
      totalSTK = await db.collection('transactions').countDocuments();
      totalPaid = await db.collection('transactions').countDocuments({ status: 'success' });
      totalFailed = await db.collection('transactions').countDocuments({ status: { $in: ['failed', 'cancelled'] } });
      
      const paidTx = await db.collection('transactions').find({ status: 'success' }).toArray();
      totalAmountCollected = paidTx.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
      
      recentTransactions = await db.collection('transactions')
        .find({})
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();
    } catch (err) {
      console.error('[MONGO] Error getting admin stats:', err.message);
    }
  } else {
    try {
      const visitsFile = path.join(os.tmpdir(), 'ZenkaPlus_visits.json');
      if (fs.existsSync(visitsFile)) {
        const visits = JSON.parse(fs.readFileSync(visitsFile, 'utf-8'));
        totalVisits = visits.length;
      }
      
      if (fs.existsSync(TX_FILE)) {
        const store = JSON.parse(fs.readFileSync(TX_FILE, 'utf-8'));
        const list = Object.keys(store).map(id => ({ checkoutRequestId: id, ...store[id] }));
        totalSTK = list.length;
        totalPaid = list.filter(tx => tx.status === 'success').length;
        totalFailed = list.filter(tx => tx.status === 'failed' || tx.status === 'cancelled').length;
        totalAmountCollected = list.filter(tx => tx.status === 'success')
          .reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
        
        recentTransactions = list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 50);
      }
    } catch (err) {
      console.error('[STORE] Error getting local stats fallback:', err.message);
    }
  }

  const systemDetails = {
    nodeVersion: process.version,
    osPlatform: os.platform(),
    osRelease: os.release(),
    freeMem: Math.round(os.freemem() / (1024 * 1024)) + ' MB',
    totalMem: Math.round(os.totalmem() / (1024 * 1024)) + ' MB',
    mongoStatus: isMongoConnected ? 'Connected' : 'Disconnected (Using Local Fallback)'
  };

  return sendJSON(res, 200, {
    success: true,
    stats: {
      totalVisits,
      totalSTK,
      totalPaid,
      totalFailed,
      totalAmountCollected,
    },
    config: {
      MPESA_PARTYB: getMpesaPartyB(),
      MPESA_SHORTCODE,
      MPESA_CALLBACK_URL,
      EXCISE_DUTY: getExciseDuty()
    },
    system: systemDetails,
    transactions: recentTransactions
  });
}

async function handleAdminConfig(req, res) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const requiredPasscode = process.env.ADMIN_PASSWORD || 'admin123';
  if (token !== requiredPasscode) {
    return sendJSON(res, 401, { success: false, message: 'Unauthorized' });
  }

  const body = await readBody(req);
  const { mpesa_partyb, excise_duty } = body;

  const updates = {};
  
  if (mpesa_partyb) {
    dynamicConfig.MPESA_PARTYB = mpesa_partyb;
    updates.MPESA_PARTYB = mpesa_partyb;
  }
  
  if (excise_duty) {
    const parsedDuty = parseInt(excise_duty, 10);
    if (!isNaN(parsedDuty)) {
      dynamicConfig.EXCISE_DUTY = parsedDuty;
      updates.EXCISE_DUTY = parsedDuty.toString();
    }
  }

  if (Object.keys(updates).length === 0) {
    return sendJSON(res, 400, { success: false, message: 'Missing configuration parameters (mpesa_partyb or excise_duty).' });
  }

  if (isMongoConnected && db) {
    try {
      const configCol = db.collection('config');
      for (const [key, val] of Object.entries(updates)) {
        await configCol.updateOne(
          { key: key },
          { $set: { value: val } },
          { upsert: true }
        );
      }
      console.log('[CONFIG] Saved dynamic configuration updates to MongoDB:', updates);
    } catch (err) {
      console.error('[MONGO] Failed to save config to MongoDB:', err.message);
    }
  } else {
    try {
      const configFile = path.join(os.tmpdir(), 'ZenkaPlus_config.json');
      let currentCfg = {};
      if (fs.existsSync(configFile)) {
        currentCfg = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      }
      const newCfg = { ...currentCfg, ...updates };
      fs.writeFileSync(configFile, JSON.stringify(newCfg, null, 2), 'utf-8');
      console.log('[CONFIG] Saved local dynamic configuration updates:', updates);
    } catch (err) {
      console.error('[STORE] Failed to save config locally:', err.message);
    }
  }

  return sendJSON(res, 200, { success: true, message: 'Configuration updated successfully.', config: updates });
}

async function handleGetPublicConfig(req, res) {
  return sendJSON(res, 200, {
    success: true,
    exciseDuty: getExciseDuty()
  });
}

// ==========================================================================
// 7. HTTP SERVER + ROUTER
// ==========================================================================
const requestHandler = async (req, res) => {
  // Establish connection lazily to reuse socket connections in serverless environments
  try {
    await connectToMongo();
  } catch (err) {
    console.error('[MONGO] Lazy connection error:', err.message);
  }

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
  if (pathname === '/api/track-visit' && method === 'POST') {
    return handleTrackVisit(req, res);
  }
  if (pathname === '/api/admin/stats' && method === 'GET') {
    return handleAdminStats(req, res);
  }
  if (pathname === '/api/admin/config' && method === 'POST') {
    return handleAdminConfig(req, res);
  }
  if (pathname === '/api/config' && method === 'GET') {
    return handleGetPublicConfig(req, res);
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
    console.log(` ZenkaPlus server successfully started!`);
    console.log(` Local access: http://localhost:${PORT}`);
    console.log(`\n API Endpoints:`);
    console.log(`   POST /api/request-stk          â†’ Initiate STK Push`);
    console.log(`   POST /api/mpesa-callback        â†’ Safaricom payment callback`);
    console.log(`   GET  /api/check-payment-status  â†’ Poll transaction status`);
    console.log(`   POST /api/mock-callback         â†’ Dev-only: simulate callback`);
    console.log(`==================================================\n`);
  });
}

module.exports = requestHandler;
module.exports.server = server;
module.exports.PORT = PORT;
