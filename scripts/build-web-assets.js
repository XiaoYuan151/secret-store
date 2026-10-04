const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const output = path.join(root, 'public');
fs.mkdirSync(path.join(output, 'assets', 'fontawesome'), { recursive: true });
for (const file of ['index.html', 'app.js', 'styles.css', 'theme.css', 'assets/icon.svg', 'assets/icon.png', 'assets/fontawesome/icons.css']) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}
for (const file of fs.readdirSync(path.join(root, 'assets', 'fontawesome')).filter(name => /^[a-z0-9-]+\.svg$/.test(name))) {
  fs.copyFileSync(path.join(root, 'assets', 'fontawesome', file), path.join(output, 'assets', 'fontawesome', file));
}
fs.writeFileSync(path.join(output, '_headers'), `/*\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`);
