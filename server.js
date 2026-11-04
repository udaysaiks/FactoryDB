const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const ADMIN_SECRET_PATH = path.join(DATA_DIR, 'admin.secret');
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const PIN_HASH_ITERATIONS = 210000;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const adminSecret = loadAdminSecret();

async function supabaseRequest(tableOrRpc, { method = 'GET', query = '', body, prefer } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  const endpoint = `${SUPABASE_URL}/rest/v1/${tableOrRpc}`;
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(`${endpoint}${query}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function readState() {
  const rows = await supabaseRequest('app_state', { query: '?id=eq.1&select=payload' });
  if (!Array.isArray(rows)) throw new Error('Supabase returned an invalid state response.');
  if (rows[0]?.payload) return rows[0].payload;

  const state = defaultState();
  await writeState(state);
  return state;
}

async function writeState(state) {
  await supabaseRequest('app_state', {
    method: 'POST',
    query: '?on_conflict=id',
    body: { id: 1, payload: state || defaultState() },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

async function saveLoginAttempt(ipHash, attempt) {
  await supabaseRequest('login_attempts', {
    method: 'POST',
    query: '?on_conflict=ip_hash',
    body: { ip_hash: ipHash, count: attempt.count, reset_at: new Date(attempt.resetAt).toISOString() },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}

function requestIpHash(req) {
  const forwardedFor = req.get('x-forwarded-for') || '';
  const ip = (forwardedFor.split(',')[0].trim() || req.ip || 'unknown');
  return crypto.createHash('sha256').update(ip).digest('hex');
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateWorkerPin() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

const seedWorkers = () => [
  { id: 'W-001', name: 'Ramesh Kumar', pin: generateWorkerPin(), role: 'Operator', skill: ['production', 'cutting'], status: 'off-duty', machine: null, checkedInAt: null, todayDone: 0, todayGoal: 0, currentOrder: null, photo: 'RK' },
  { id: 'W-002', name: 'Suresh Patil', pin: generateWorkerPin(), role: 'Operator', skill: ['production'], status: 'off-duty', machine: null, checkedInAt: null, todayDone: 0, todayGoal: 0, currentOrder: null, photo: 'SP' },
  { id: 'W-003', name: 'Anita Devi', pin: generateWorkerPin(), role: 'Operator', skill: ['production', 'cutting'], status: 'off-duty', machine: null, checkedInAt: null, todayDone: 0, todayGoal: 0, currentOrder: null, photo: 'AD' },
  { id: 'W-004', name: 'Priya Mehta', pin: generateWorkerPin(), role: 'Operator', skill: ['production'], status: 'off-duty', machine: null, checkedInAt: null, todayDone: 0, todayGoal: 0, currentOrder: null, photo: 'PM' },
  { id: 'W-005', name: 'Mohan Rao', pin: generateWorkerPin(), role: 'Operator', skill: ['cutting'], status: 'off-duty', machine: null, checkedInAt: null, todayDone: 0, todayGoal: 0, currentOrder: null, photo: 'MR' },
  { id: 'W-006', name: 'Kavya Sharma', pin: generateWorkerPin(), role: 'Operator', skill: ['cutting'], status: 'off-duty', machine: null, checkedInAt: null, todayDone: 0, todayGoal: 0, currentOrder: null, photo: 'KS' },
  { id: 'W-007', name: 'Vijay Nair', pin: generateWorkerPin(), role: 'Operator', skill: ['cutting', 'production'], status: 'off-duty', machine: null, checkedInAt: null, todayDone: 0, todayGoal: 0, currentOrder: null, photo: 'VN' },
  { id: 'W-008', name: 'Deepa Singh', pin: generateWorkerPin(), role: 'Operator', skill: ['production'], status: 'off-duty', machine: null, checkedInAt: null, todayDone: 0, todayGoal: 0, currentOrder: null, photo: 'DS' },
];

const seedMachines = () => [
  { id: 'TF-01', type: 'production', label: 'Thermoformer 1', status: 'idle', worker: null, orderId: null, doneQty: 0, goalQty: 0, runStart: null, notes: '' },
  { id: 'TF-02', type: 'production', label: 'Thermoformer 2', status: 'idle', worker: null, orderId: null, doneQty: 0, goalQty: 0, runStart: null, notes: '' },
  { id: 'TF-03', type: 'production', label: 'Thermoformer 3', status: 'down', worker: null, orderId: null, doneQty: 0, goalQty: 0, runStart: null, notes: 'Heating element fault' },
  { id: 'TF-04', type: 'production', label: 'Vacuum Former 1', status: 'idle', worker: null, orderId: null, doneQty: 0, goalQty: 0, runStart: null, notes: '' },
  { id: 'TF-05', type: 'production', label: 'Vacuum Former 2', status: 'idle', worker: null, orderId: null, doneQty: 0, goalQty: 0, runStart: null, notes: '' },
  { id: 'CT-01', type: 'cutting', label: 'Cutting Line 1', status: 'idle', worker: null, orderId: null, doneQty: 0, goalQty: 0, runStart: null, notes: '' },
  { id: 'CT-02', type: 'cutting', label: 'Cutting Line 2', status: 'idle', worker: null, orderId: null, doneQty: 0, goalQty: 0, runStart: null, notes: '' },
  { id: 'CT-03', type: 'cutting', label: 'Cutting Line 3', status: 'idle', worker: null, orderId: null, doneQty: 0, goalQty: 0, runStart: null, notes: '' },
];

const seedOrders = () => [
  { id: 'ORD-001', client: 'Client A', product: 'CUMA Bottom PET tray', qty: 8000, formedQty: 5200, cutQty: 4800, dispatch: '2026-07-01', priority: 'high', status: 'active' },
  { id: 'ORD-002', client: 'Client B', product: 'Denso tray', qty: 10000, formedQty: 4820, cutQty: 3900, dispatch: '2026-07-02', priority: 'high', status: 'active' },
  { id: 'ORD-003', client: 'Client C', product: 'CUMA Bottom PET tray', qty: 5000, formedQty: 3800, cutQty: 3100, dispatch: '2026-07-04', priority: 'medium', status: 'active' },
  { id: 'ORD-004', client: 'Client D', product: 'Denso tray', qty: 6400, formedQty: 6400, cutQty: 6400, dispatch: '2026-06-30', priority: 'low', status: 'completed' },
  { id: 'ORD-005', client: 'Client E', product: 'CUMA Bottom PET tray', qty: 12000, formedQty: 6000, cutQty: 4200, dispatch: '2026-07-06', priority: 'medium', status: 'active' },
  { id: 'ORD-006', client: 'Client F', product: 'Denso tray', qty: 4000, formedQty: 1200, cutQty: 800, dispatch: '2026-07-08', priority: 'low', status: 'active' },
  { id: 'ORD-007', client: 'Client G', product: 'CUMA Bottom PET tray', qty: 15000, formedQty: 5700, cutQty: 5100, dispatch: '2026-07-01', priority: 'urgent', status: 'active' },
];

const seedInventory = () => ({
  raw: [
    { id: 'RM-1', material: 'PET sheet', grade: 'Food-grade', qty: 42, unit: 'rolls', thickness: '0.3 mm', min: 15 },
    { id: 'RM-2', material: 'HIPS sheet', grade: 'Standard', qty: 18, unit: 'rolls', thickness: '0.5 mm', min: 12 },
    { id: 'RM-3', material: 'PP sheet', grade: 'Food-grade', qty: 4, unit: 'rolls', thickness: '0.4 mm', min: 10 },
    { id: 'RM-4', material: 'PVC sheet', grade: 'Standard', qty: 11, unit: 'rolls', thickness: '0.6 mm', min: 10 },
  ],
  mould: [
    { id: 'M-001', trayType: 'Denso tray', cavity: '6-cavity', assignedTo: 'TF-01', condition: 'good' },
    { id: 'M-002', trayType: 'CUMA Bottom PET tray', cavity: '4-cavity', assignedTo: 'TF-02', condition: 'good' },
    { id: 'M-003', trayType: 'Denso tray', cavity: '8-cavity', assignedTo: 'TF-04', condition: 'watch' },
    { id: 'M-004', trayType: 'CUMA Bottom PET tray', cavity: '6-cavity', assignedTo: 'TF-05', condition: 'good' },
    { id: 'M-005', trayType: 'Denso tray', cavity: '4-cavity', assignedTo: 'Storage', condition: 'stored' },
  ],
  pack: [
    { id: 'PK-1', item: 'Cardboard boxes (large)', unit: 'pcs', qty: 820, usedToday: 96, min: 200 },
    { id: 'PK-2', item: 'Cardboard boxes (small)', unit: 'pcs', qty: 340, usedToday: 48, min: 150 },
    { id: 'PK-3', item: 'Stretch wrap rolls', unit: 'rolls', qty: 12, usedToday: 2, min: 8 },
    { id: 'PK-4', item: 'Adhesive tape', unit: 'rolls', qty: 6, usedToday: 4, min: 8 },
    { id: 'PK-5', item: 'Labels / stickers', unit: 'sheets', qty: 1200, usedToday: 144, min: 300 },
  ],
});

const seedPurchaseOrders = () => [
  { id: 'PO-102', item: 'PET sheet', qty: 20, vendor: 'Apex Plastics', eta: '2026-07-02', status: 'In transit' },
  { id: 'PO-103', item: 'Cardboard boxes', qty: 500, vendor: 'PackFlow Ltd', eta: '2026-07-05', status: 'Queued' },
  { id: 'PO-104', item: 'Adhesive tape', qty: 30, vendor: 'Northline Supply', eta: '2026-07-01', status: 'Received' },
];

const seedDispatchBoard = () => [
  { id: 'DSP-21', route: 'Hyderabad', truck: 'TR-07', eta: '2026-07-01 12:30', load: 'ORD-001 / ORD-003', status: 'Ready' },
  { id: 'DSP-22', route: 'Bengaluru', truck: 'TR-12', eta: '2026-07-02 08:00', load: 'ORD-006', status: 'In route' },
  { id: 'DSP-23', route: 'Chennai', truck: 'TR-15', eta: '2026-07-03 15:45', load: 'ORD-007', status: 'Planning' },
];

const defaultState = () => ({
  workers: seedWorkers(),
  machines: seedMachines(),
  orders: seedOrders(),
  inventory: seedInventory(),
  purchaseOrders: seedPurchaseOrders(),
  dispatchBoard: seedDispatchBoard(),
  scanLog: [],
  session: null,
});

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(pin, salt, PIN_HASH_ITERATIONS, 32, 'sha256').toString('hex');
  return `pbkdf2$${PIN_HASH_ITERATIONS}$${salt}$${hash}`;
}

function verifyPin(pin, storedPin) {
  if (typeof pin !== 'string' || typeof storedPin !== 'string') return false;
  const parts = storedPin.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    const actual = Buffer.from(pin.padEnd(128, '\0').slice(0, 128));
    const expected = Buffer.from(storedPin.padEnd(128, '\0').slice(0, 128));
    return crypto.timingSafeEqual(actual, expected) && pin.length === storedPin.length;
  }

  const [, iterations, salt, expectedHash] = parts;
  const iterationCount = Number(iterations);
  if (!Number.isInteger(iterationCount) || iterationCount < 100000 || iterationCount > 1000000
    || !/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{64}$/i.test(expectedHash)) {
    return false;
  }
  const actualHash = crypto.pbkdf2Sync(pin, salt, iterationCount, 32, 'sha256');
  const expected = Buffer.from(expectedHash, 'hex');
  return actualHash.length === expected.length && crypto.timingSafeEqual(actualHash, expected);
}

function safeState(state, auth) {
  const result = {
    ...state,
    workers: (state.workers || []).map(({ pin, ...worker }) => worker),
    session: null,
  };

  if (auth?.role === 'worker') {
    result.workers = result.workers.filter((worker) => worker.id === auth.workerId);
    result.inventory = { raw: [], mould: [], pack: [] };
    result.purchaseOrders = [];
    result.dispatchBoard = [];
    result.scanLog = [];
  }

  return result;
}

function loadAdminSecret() {
  if (process.env.ADMIN_SECRET) {
    if (process.env.ADMIN_SECRET.length < 16) {
      throw new Error('ADMIN_SECRET must contain at least 16 characters.');
    }
    return process.env.ADMIN_SECRET;
  }

  if (process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT) {
    throw new Error('ADMIN_SECRET must be configured in the deployment environment.');
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(ADMIN_SECRET_PATH)) {
    return fs.readFileSync(ADMIN_SECRET_PATH, 'utf8').trim();
  }

  const secret = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(ADMIN_SECRET_PATH, `${secret}\n`, { mode: 0o600, flag: 'wx' });
  console.log(`Initial administrator secret saved to: ${ADMIN_SECRET_PATH}`);
  return secret;
}

function loginRateLimit(req, res, next) {
  (async () => {
    const ipHash = requestIpHash(req);
    const rows = await supabaseRequest('login_attempts', { query: `?ip_hash=eq.${ipHash}&select=count,reset_at` });
    const now = Date.now();
    const saved = rows[0];
    const attempt = saved && Date.parse(saved.reset_at) > now
      ? { count: saved.count, resetAt: Date.parse(saved.reset_at) }
      : { count: 0, resetAt: now + 15 * 60 * 1000 };
    if (attempt.count >= 10) {
      res.set('Retry-After', String(Math.ceil((attempt.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    }
    req.loginAttempt = { ...attempt, ipHash };
    next();
  })().catch((error) => {
    console.error('Login rate limit check failed:', error);
    res.status(503).json({ error: 'Login is temporarily unavailable.' });
  });
}

async function requireAuth(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    const rows = await supabaseRequest('auth_sessions', {
      query: `?token_hash=eq.${hashSessionToken(token)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=role,worker_id,worker_name,expires_at`,
    });
    const session = rows[0];
    if (!session) return res.status(401).json({ error: 'Authentication required.' });
    req.auth = {
      role: session.role,
      workerId: session.worker_id,
      workerName: session.worker_name,
      expiresAt: Date.parse(session.expires_at),
    };
    req.authToken = token;
    next();
  } catch (error) {
    console.error('Session lookup failed:', error);
    res.status(503).json({ error: 'Authentication is temporarily unavailable.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.auth?.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }
  next();
}

function mergeWorkerCredentials(incomingWorkers, currentWorkers) {
  const currentById = new Map((currentWorkers || []).map((worker) => [worker.id, worker]));
  return (incomingWorkers || []).map((worker) => {
    const current = currentById.get(worker.id);
    const suppliedPin = worker.pin;
    const pin = current && suppliedPin === current.pin
      ? current.pin
      : typeof suppliedPin === 'string' && suppliedPin.length > 0
        ? hashPin(suppliedPin)
        : current?.pin;
    return { ...worker, pin };
  });
}

app.use(express.json({ limit: '1mb' }));
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin) {
    res.vary('Origin');
    if (allowedOrigins.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    }
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(!origin || allowedOrigins.has(origin) ? 204 : 403);
  }

  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});

app.get(['/healthz', '/api/healthz'], (req, res) => {
  supabaseRequest('app_state', { query: '?select=id&limit=1' })
    .then(() => res.json({ ok: true }))
    .catch((error) => {
      console.error('Health check failed:', error);
      res.status(503).json({ ok: false });
    });
});

app.get('/api/auth/workers', async (req, res) => {
  try {
    const state = await readState();
    res.json((state.workers || []).map(({ id, name }) => ({ id, name })));
  } catch (error) {
    res.status(500).json({ error: 'Unable to load worker list.' });
  }
});

app.post('/api/auth/login', loginRateLimit, async (req, res) => {
  try {
    const { role, workerId, pin } = req.body || {};
    let session;
    if (role === 'admin' && verifyPin(pin, adminSecret)) {
      session = { role: 'admin', workerId: null, workerName: 'Administrator' };
    } else if (role === 'worker') {
      const state = await readState();
      const worker = (state.workers || []).find((item) => item.id === workerId);
      if (worker && verifyPin(pin, worker.pin)) {
        session = { role: 'worker', workerId: worker.id, workerName: worker.name };
      }
    }

    if (!session) {
      req.loginAttempt.count += 1;
      await saveLoginAttempt(req.loginAttempt.ipHash, req.loginAttempt);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    await supabaseRequest('login_attempts', {
      method: 'DELETE',
      query: `?ip_hash=eq.${req.loginAttempt.ipHash}`,
    });
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await supabaseRequest('auth_sessions', {
      method: 'POST',
      body: {
        token_hash: hashSessionToken(token),
        role: session.role,
        worker_id: session.workerId,
        worker_name: session.workerName,
        expires_at: expiresAt.toISOString(),
      },
      prefer: 'return=minimal',
    });
    res.json({ token, session: { ...session, expiresAt: expiresAt.getTime() } });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(503).json({ error: 'Login is temporarily unavailable.' });
  }
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    await supabaseRequest('auth_sessions', {
      method: 'DELETE',
      query: `?token_hash=eq.${hashSessionToken(req.authToken)}`,
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Logout failed:', error);
    res.status(503).json({ error: 'Unable to log out right now.' });
  }
});

app.post('/api/workers/:workerId/reset-pin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const state = await readState();
    const worker = (state.workers || []).find((item) => item.id === req.params.workerId);
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });

    const pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    worker.pin = hashPin(pin);
    await writeState(state);
    res.json({ ok: true, pin });
  } catch (error) {
    res.status(500).json({ error: 'Unable to update worker PIN.' });
  }
});

app.get('/api/state', requireAuth, async (req, res) => {
  try {
    const state = await readState();
    res.json(safeState(state, req.auth));
  } catch (error) {
    res.status(500).json({ error: 'Unable to read state' });
  }
});

app.put('/api/state', requireAuth, requireAdmin, async (req, res) => {
  try {
    const payload = req.body || {};
    const current = await readState();
    const next = {
      ...payload,
      workers: mergeWorkerCredentials(payload.workers, current.workers),
      session: null,
    };
    await writeState(next);
    res.json({ ok: true, message: 'Data saved' });
  } catch (error) {
    res.status(500).json({ error: 'Unable to save state' });
  }
});

app.post('/api/production/report', requireAuth, async (req, res) => {
  try {
    const { orderId, stage, quantity } = req.body || {};
    if (!['formedQty', 'cutQty'].includes(stage) || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'Provide a valid production stage and positive whole quantity.' });
    }

    const state = await readState();
    const order = (state.orders || []).find((item) => item.id === orderId);
    if (!order || order.status === 'completed') {
      return res.status(404).json({ error: 'Active order not found.' });
    }

    const currentQty = Number(order[stage]) || 0;
    const limit = stage === 'formedQty' ? Number(order.qty) : Number(order.formedQty) || 0;
    if (currentQty + quantity > limit) {
      return res.status(400).json({ error: 'Reported quantity exceeds the remaining stage limit.' });
    }

    order[stage] = currentQty + quantity;
    if ((Number(order.cutQty) || 0) >= Number(order.qty)) order.status = 'completed';
    await writeState(state);
    res.json({ order });
  } catch (error) {
    res.status(500).json({ error: 'Unable to record production.' });
  }
});

app.post('/api/state/reset', requireAuth, requireAdmin, async (req, res) => {
  try {
    const next = defaultState();
    next.workers = mergeWorkerCredentials(next.workers, []);
    await writeState(next);
    res.json(safeState(next));
  } catch (error) {
    res.status(500).json({ error: 'Unable to reset state' });
  }
});

app.get('/api/erp/export', requireAuth, requireAdmin, async (req, res) => {
  try {
    const state = await readState();
    const payload = {
      exportedAt: new Date().toISOString(),
      company: 'VINPAC',
      summary: {
        workers: state.workers?.length || 0,
        machines: state.machines?.length || 0,
        orders: state.orders?.length || 0,
        inventoryItems: state.inventory?.raw?.length || 0,
        purchaseOrders: state.purchaseOrders?.length || 0,
        dispatchLoads: state.dispatchBoard?.length || 0,
      },
      workers: safeState(state).workers,
      machines: state.machines || [],
      orders: state.orders || [],
      inventory: state.inventory || { raw: [], mould: [], pack: [] },
      purchaseOrders: state.purchaseOrders || [],
      dispatchBoard: state.dispatchBoard || [],
    };
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: 'Unable to export ERP payload' });
  }
});

app.get('/api/erp/export.csv', requireAuth, requireAdmin, async (req, res) => {
  try {
    const state = await readState();
    const rows = [
      ['order_id', 'client', 'product', 'qty', 'dispatch', 'priority', 'status'],
      ...((state.orders || []).map((order) => [
        order.id,
        order.client || '',
        order.product || '',
        String(order.qty || 0),
        order.dispatch || '',
        order.priority || 'medium',
        order.status || 'active',
      ])),
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment('vinpac-erp-orders.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Unable to export ERP CSV' });
  }
});

module.exports = app;

if (require.main === module) {
  const clientDir = path.join(__dirname, 'dist');
  app.use(express.static(clientDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
  app.listen(PORT, () => {
    console.log(`VINPAC API server running at http://localhost:${PORT}`);
  });
}
