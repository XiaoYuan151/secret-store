const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { postgres } = require('./web-db');
const { createApi } = require('./web-core');

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const files = { '/': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css', '/theme.css': 'theme.css', '/assets/icon.svg': 'assets/icon.svg', '/assets/icon.png': 'assets/icon.png', '/assets/fontawesome/icons.css': 'assets/fontawesome/icons.css' };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
function nodeRequest(req) {
  const chunks = [];
  return (async () => {
    for await (const chunk of req) { chunks.push(chunk); if (Buffer.concat(chunks).length > 50000) break; }
    const origin = process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`;
    return new Request(new URL(req.url, origin), { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
  })();
}
async function nodeResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}
async function start() {
  const db = postgres(process.env.DATABASE_URL);
  await db.init();
  const api = createApi(db, { sessionSecret: process.env.SESSION_SECRET, publicOrigin: process.env.PUBLIC_ORIGIN, secure: process.env.COOKIE_SECURE === '1' });
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const expectedHost = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).host : null;
      if (expectedHost ? req.headers.host !== expectedHost : ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) { res.writeHead(403); res.end(); return; }
      if (pathname.startsWith('/api/')) return nodeResponse(res, await api(await nodeRequest(req)));
      const icon = /^\/assets\/fontawesome\/[a-z0-9-]+\.svg$/.test(pathname);
      const file = files[pathname] || (icon ? pathname.slice(1) : null);
      if (req.method !== 'GET' || !file || !fs.existsSync(path.join(__dirname, file))) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'", 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      fs.createReadStream(path.join(__dirname, file)).pipe(res);
    } catch { res.writeHead(500); res.end(); }
  });
  server.listen(port, host, () => console.log(`Secret Store web listening on http://${host}:${port}`));
}
if (require.main === module) start().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { start };
