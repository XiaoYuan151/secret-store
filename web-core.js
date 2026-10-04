const crypto = require('node:crypto');
const { testKey } = require('./tests-api');
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const verifier = key => crypto.createHmac('sha256', key).update('secret-store-v1').digest();
const derive = (password, salt) => new Promise((resolve, reject) => crypto.scrypt(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, key) => e ? reject(e) : resolve(key)));
function encrypt(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
}
function decrypt(bytes, key) {
  const data = Buffer.from(bytes);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString());
}
function validateEntry(input) {
  if (!input || typeof input !== 'object') fail('Invalid entry');
  const entry = {
    id: typeof input.id === 'string' && /^[a-f0-9-]{36}$/.test(input.id) ? input.id : crypto.randomUUID(),
    platform: String(input.platform || 'Custom').trim().slice(0, 80), label: String(input.label || '').trim().slice(0, 120),
    keyId: String(input.keyId || '').trim().slice(0, 300), email: String(input.email || '').trim().slice(0, 300),
    secret: String(input.secret || '').slice(0, 12000), envName: String(input.envName || '').trim().slice(0, 120),
    tags: Array.isArray(input.tags) ? input.tags.map(x => String(x).trim().slice(0, 40)).filter(Boolean).slice(0, 16) : [],
    note: String(input.note || '').slice(0, 3000), expiresAt: /^\d{4}-\d{2}-\d{2}$/.test(input.expiresAt || '') ? input.expiresAt : '',
    createdAt: input.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  if (!entry.label || !entry.secret) fail('Name and key are required');
  return entry;
}
function createApi(db, options) {
  if (!options.sessionSecret || Buffer.byteLength(options.sessionSecret) < 32) throw new Error('Set SESSION_SECRET to at least 32 random characters');
  const wrappingKey = crypto.createHash('sha256').update(options.sessionSecret).digest();
  const cookie = (value, age) => `sid=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${options.secure ? '; Secure' : ''}`;
  const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
  const sidOf = request => /(?:^|;\s*)sid=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie') || '')?.[1];
  async function session(request) {
    const sid = sidOf(request);
    if (!sid) return null;
    const id = crypto.createHash('sha256').update(sid).digest('hex');
    const row = await db.session(id);
    if (!row) return null;
    if (Date.now() - Number(row.last_active) > 900000) { await db.deleteSession(id); return null; }
    try {
      const key = Buffer.from(decrypt(row.payload, wrappingKey).key, 'base64');
      await db.saveSession(id, row.payload, Date.now());
      return { id, key };
    } catch { return null; }
  }
  async function newSession(key) {
    const sid = crypto.randomBytes(32).toString('hex');
    const id = crypto.createHash('sha256').update(sid).digest('hex');
    await db.saveSession(id, encrypt({ key: key.toString('base64') }, wrappingKey), Date.now());
    return cookie(sid, 900);
  }
  const status = unlocked => ({ configured: true, unlocked, platform: 'web', biometricSupported: false, biometricAvailable: false });
  const list = async key => (await db.list('vault_entries')).map(x => decrypt(x, key)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const platforms = async key => (await db.list('vault_platforms')).map(x => decrypt(x, key).name).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  return async request => {
    let active;
    try {
      const url = new URL(request.url);
      const action = url.pathname.startsWith('/api/') ? url.pathname.slice(5) : '';
      if (!action) fail('Not found', 404);
      if (options.publicOrigin && url.origin !== options.publicOrigin) fail('Invalid host', 403);
      if (request.method !== 'POST' && !['status', 'list', 'platforms'].includes(action)) fail('Method not allowed', 405);
      if (request.method === 'POST') {
        if (request.headers.get('x-csrf') !== '1') fail('Missing request protection', 403);
        const origin = request.headers.get('origin');
        if (origin && origin !== (options.publicOrigin || url.origin)) fail('Invalid origin', 403);
      }
      if (action === 'status') return json({ configured: !!(await db.setting('salt')), unlocked: !!(active = await session(request)), platform: 'web', biometricSupported: false, biometricAvailable: false });
      let data = {};
      if (request.method === 'POST') {
        const raw = await request.text();
        if (Buffer.byteLength(raw) > 50000) fail('Request too large', 413);
        try { data = JSON.parse(raw || '{}'); } catch { fail('Invalid JSON'); }
      }
      if (action === 'setup') {
        if (typeof data.password !== 'string' || data.password.length < 12) fail('Use at least 12 characters');
        const salt = crypto.randomBytes(24);
        const key = await derive(data.password, salt);
        try {
          if (!await db.setup(salt.toString('base64'), verifier(key).toString('hex'))) fail('Vault already exists', 409);
          return json(status(true), 200, { 'Set-Cookie': await newSession(key) });
        } finally { key.fill(0); }
      }
      if (action === 'unlock') {
        const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || 'unknown';
        const attemptId = crypto.createHash('sha256').update(ip).digest('hex');
        const attempt = await db.attempt(attemptId) || { count: 0, until_time: 0 };
        if (Date.now() < Number(attempt.until_time)) fail('Please wait before trying again', 429);
        if (typeof data.password !== 'string') fail('Invalid password');
        const salt = await db.setting('salt'); if (!salt) fail('Vault is not configured', 409);
        const key = await derive(data.password, Buffer.from(salt, 'base64'));
        try {
          const expected = Buffer.from(await db.setting('verifier'), 'hex');
          if (expected.length !== 32 || !crypto.timingSafeEqual(verifier(key), expected)) {
            const count = Number(attempt.count) + 1;
            await db.saveAttempt(attemptId, count, Date.now() + Math.min(30000, 1000 * 2 ** Math.min(count, 5)));
            fail('Incorrect password', 401);
          }
          await db.deleteAttempt(attemptId);
          return json(await list(key), 200, { 'Set-Cookie': await newSession(key) });
        } finally { key.fill(0); }
      }
      active = await session(request);
      if (!active) fail('Vault is locked', 401);
      if (action === 'lock') { await db.deleteSession(active.id); return json(status(false), 200, { 'Set-Cookie': cookie('', 0) }); }
      if (action === 'list' && request.method === 'GET') return json(await list(active.key));
      if (action === 'platforms' && request.method === 'GET') return json(await platforms(active.key));
      if (action === 'add-platform') {
        const name = String(data.name || '').trim();
        if (!name || name.length > 80) fail('Platform name must be 1–80 characters');
        const existing = (await platforms(active.key)).find(x => x.toLocaleLowerCase() === name.toLocaleLowerCase());
        if (existing) return json(existing);
        await db.save('vault_platforms', crypto.randomUUID(), encrypt({ name }, active.key)); return json(name);
      }
      if (action === 'save') { const entry = validateEntry(data); await db.save('vault_entries', entry.id, encrypt(entry, active.key)); return json(entry); }
      if (action === 'delete') { await db.delete(String(data.id)); return json(true); }
      if (action === 'test') return json(await testKey(data));
      fail('Not found', 404);
    } catch (error) { return json({ error: error.status ? error.message : 'Server error' }, error.status || 500); }
    finally { active?.key.fill(0); }
  };
}
module.exports = { createApi };
