const { postgres } = require('./web-db');
const { createApi } = require('./web-core');
const db = postgres(process.env.DATABASE_URL, true);
const ready = db.init();
const api = createApi(db, { sessionSecret: process.env.SESSION_SECRET, publicOrigin: process.env.PUBLIC_ORIGIN, secure: true });
module.exports = async (req, res) => {
  try {
    await ready;
    const origin = process.env.PUBLIC_ORIGIN || `https://${req.headers.host}`;
    const request = new Request(new URL(req.url, origin), { method: req.method, headers: req.headers, body: req.method === 'POST' ? JSON.stringify(req.body || {}) : undefined });
    const response = await api(request);
    res.status(response.status);
    for (const [name, value] of response.headers) res.setHeader(name, value);
    res.send(await response.text());
  } catch { res.status(500).json({ error: 'Server error' }); }
};
