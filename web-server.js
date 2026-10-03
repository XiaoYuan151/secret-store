const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');
const { testKey } = require('./tests-api');

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to a PostgreSQL connection string');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8, idleTimeoutMillis: 30000 });
const sessions = new Map();
const attempts = new Map();
const staticFiles = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.js': ['app.js', 'text/javascript; charset=utf-8'], '/styles.css': ['styles.css', 'text/css; charset=utf-8'], '/theme.css': ['theme.css', 'text/css; charset=utf-8'], '/assets/icon.svg': ['assets/icon.svg', 'image/svg+xml'], '/assets/icon.png': ['assets/icon.png', 'image/png'], '/assets/fontawesome/icons.css': ['assets/fontawesome/icons.css', 'text/css; charset=utf-8'] };
const verifier = key => crypto.createHmac('sha256', key).update('secret-store-v1').digest();
const derive = (password, salt) => new Promise((resolve, reject) => crypto.scrypt(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, key) => e ? reject(e) : resolve(key)));
const send = (res, code, data, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(data));
};
const fail = (message, code = 400) => { const error = new Error(message); error.status = code; throw error; };
const parseCookie = req => (req.headers.cookie || '').split(';').map(x => x.trim().split('=')).find(x => x[0] === 'sid')?.[1];
const cookie = (value, maxAge) => `sid=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`;
function session(req) {
  const token = parseCookie(req);
  const value = sessions.get(token);
  if (!value) return null;
  if (Date.now() - value.lastActive > 15 * 60 * 1000) { value.key.fill(0); sessions.delete(token); return null; }
  value.lastActive = Date.now();
  return value;
}
function encrypt(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}
function decrypt(bytes, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
}
async function setting(name) { return (await pool.query('SELECT value FROM vault_settings WHERE name=$1', [name])).rows[0]?.value; }
async function list(key) { return (await pool.query('SELECT payload FROM vault_entries')).rows.map(row => decrypt(row.payload, key)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
function validateEntry(input) {
  if (!input || typeof input !== 'object') fail('Invalid entry');
  const entry = {
    id: typeof input.id === 'string' && /^[a-f0-9-]{36}$/.test(input.id) ? input.id : crypto.randomUUID(),
    platform: String(input.platform || 'Custom').trim().slice(0, 80),
    label: String(input.label || '').trim().slice(0, 120),
    keyId: String(input.keyId || '').trim().slice(0, 300),
    email: String(input.email || '').trim().slice(0, 300),
    secret: String(input.secret || '').slice(0, 12000),
    envName: String(input.envName || '').trim().slice(0, 120),
    tags: Array.isArray(input.tags) ? input.tags.map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 16) : [],
    note: String(input.note || '').slice(0, 3000),
    expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt || '') ? input.expiresAt : '',
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!entry.label || !entry.secret) fail('Name and key are required');
  return entry;
}
async function body(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 50000) fail('Request too large', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { fail('Invalid JSON'); }
}
async function route(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const expectedHost = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).host : null;
  if (expectedHost ? req.headers.host !== expectedHost : ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) fail('Invalid host', 403);
  if (!pathname.startsWith('/api/')) {
    const iconAsset = /^\/assets\/fontawesome\/([a-z0-9-]+)\.svg$/.exec(pathname);
    const asset = staticFiles[pathname] || (iconAsset ? [`assets/fontawesome/${iconAsset[1]}.svg`, 'image/svg+xml'] : null);
    if (req.method !== 'GET' || !asset) return send(res, 404, { error: 'Not found' });
    const [file, type] = asset;
    if (!fs.existsSync(path.join(__dirname, file))) return send(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'", 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    fs.createReadStream(path.join(__dirname, file)).pipe(res);
    return;
  }
  const action = pathname.slice(5);
  if (req.method !== 'POST' && !['status', 'list'].includes(action)) fail('Method not allowed', 405);
  if (req.method === 'POST') {
    if (req.headers['x-csrf'] !== '1') fail('Missing request protection', 403);
    const origin = req.headers.origin;
    if (origin) {
      const expected = process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
      if (origin !== expected) fail('Invalid origin', 403);
    }
  }
  if (action === 'status' && req.method === 'GET') return send(res, 200, { configured: !!(await setting('salt')), unlocked: !!session(req), platform: 'web', biometricSupported: false, biometricAvailable: false });
  const data = req.method === 'POST' ? await body(req) : {};
  if (action === 'setup') {
    if (typeof data.password !== 'string' || data.password.length < 12) fail('Use at least 12 characters');
    const salt = crypto.randomBytes(24);
    const key = await derive(data.password, salt);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE vault_settings IN EXCLUSIVE MODE');
      if ((await client.query("SELECT 1 FROM vault_settings WHERE name='salt'")).rowCount) fail('Vault already exists', 409);
      await client.query('INSERT INTO vault_settings(name,value) VALUES($1,$2),($3,$4)', ['salt', salt.toString('base64'), 'verifier', verifier(key).toString('hex')]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); key.fill(0); throw e; } finally { client.release(); }
    const sid = crypto.randomBytes(32).toString('hex'); sessions.set(sid, { key, lastActive: Date.now() });
    return send(res, 200, { configured: true, unlocked: true, platform: 'web', biometricSupported: false, biometricAvailable: false }, { 'Set-Cookie': cookie(sid, 900) });
  }
  if (action === 'unlock') {
    const ip = req.socket.remoteAddress;
    const attempt = attempts.get(ip) || { count: 0, until: 0 };
    if (Date.now() < attempt.until) fail('Please wait before trying again', 429);
    if (typeof data.password !== 'string') fail('Invalid password');
    const saltText = await setting('salt'); if (!saltText) fail('Vault is not configured', 409);
    const key = await derive(data.password, Buffer.from(saltText, 'base64'));
    const expected = Buffer.from(await setting('verifier'), 'hex');
    if (!crypto.timingSafeEqual(verifier(key), expected)) {
      key.fill(0); attempt.count++; attempt.until = Date.now() + Math.min(30000, 1000 * 2 ** Math.min(attempt.count, 5)); attempts.set(ip, attempt);
      fail('Incorrect password', 401);
    }
    attempts.delete(ip);
    const sid = crypto.randomBytes(32).toString('hex'); sessions.set(sid, { key, lastActive: Date.now() });
    return send(res, 200, await list(key), { 'Set-Cookie': cookie(sid, 900) });
  }
  const active = session(req);
  if (!active) fail('Vault is locked', 401);
  if (action === 'lock') {
    active.key.fill(0); sessions.delete(parseCookie(req));
    return send(res, 200, { configured: true, unlocked: false, platform: 'web', biometricSupported: false, biometricAvailable: false }, { 'Set-Cookie': cookie('', 0) });
  }
  if (action === 'list' && req.method === 'GET') return send(res, 200, await list(active.key));
  if (action === 'save') {
    const entry = validateEntry(data);
    await pool.query('INSERT INTO vault_entries(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload', [entry.id, encrypt(entry, active.key)]);
    return send(res, 200, entry);
  }
  if (action === 'delete') {
    await pool.query('DELETE FROM vault_entries WHERE id=$1', [String(data.id)]);
    return send(res, 200, true);
  }
  if (action === 'test') return send(res, 200, await testKey(data));
  fail('Not found', 404);
}
async function start() {
  await pool.query('CREATE TABLE IF NOT EXISTS vault_settings (name text PRIMARY KEY, value text NOT NULL)');
  await pool.query('CREATE TABLE IF NOT EXISTS vault_entries (id uuid PRIMARY KEY, payload bytea NOT NULL)');
  const server = http.createServer((req, res) => route(req, res).catch(e => send(res, e.status || 500, { error: e.status ? e.message : 'Server error' })));
  server.listen(port, host, () => console.log(`Secret Store web listening on http://${host}:${port}`));
  setInterval(() => {
    for (const [id, value] of sessions) if (Date.now() - value.lastActive > 15 * 60 * 1000) { value.key.fill(0); sessions.delete(id); }
    for (const [ip, value] of attempts) if (Date.now() - value.until > 60000) attempts.delete(ip);
  }, 60000).unref();
}
start().catch(error => { console.error(error); process.exitCode = 1; });
