const { app, BrowserWindow, ipcMain, clipboard, shell, systemPreferences, safeStorage, nativeImage, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { testKey } = require('./tests-api');

let db;
let vaultKey;
let failedAttempts = 0;
let nextAttempt = 0;
let clearClipboardTimer;
let lastCopied;
const wrapPath = () => path.join(app.getPath('userData'), 'biometric.key');
function updateDockIcon() { app.dock?.setIcon(nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'))); }
function updateWindowBackgrounds() { BrowserWindow.getAllWindows().forEach(window => window.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#11161e' : '#f7f9fc')); }

function database() {
  if (db) return db;
  process.umask(0o077);
  fs.mkdirSync(app.getPath('userData'), { recursive: true, mode: 0o700 });
  fs.chmodSync(app.getPath('userData'), 0o700);
  db = new DatabaseSync(path.join(app.getPath('userData'), 'vault.sqlite'));
  fs.chmodSync(path.join(app.getPath('userData'), 'vault.sqlite'), 0o600);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS platforms (id TEXT PRIMARY KEY, payload TEXT NOT NULL);');
  return db;
}
function setting(name) { return database().prepare('SELECT value FROM settings WHERE name=?').get(name)?.value; }
function setSetting(name, value) { database().prepare('INSERT INTO settings(name,value) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(name, value); }
function derive(password, salt) { return new Promise((resolve, reject) => crypto.scrypt(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key))); }
function checkKey(key) { return crypto.createHmac('sha256', key).update('secret-store-v1').digest('hex'); }
function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
function decrypt(payload) {
  const bytes = Buffer.from(payload, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
}
function locked() { if (!vaultKey) throw new Error('Vault is locked'); }
function validateEntry(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid entry');
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
  if (!entry.label || !entry.secret) throw new Error('Name and key are required');
  return entry;
}
function entries() { locked(); return database().prepare('SELECT payload FROM entries').all().map(row => decrypt(row.payload)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
function customPlatforms() { locked(); return database().prepare('SELECT payload FROM platforms').all().map(row => decrypt(row.payload).name).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })); }
function validatePlatformName(value) { const name = String(value || '').trim(); if (!name || name.length > 80) throw new Error('Platform name must be 1–80 characters'); return name; }
function status() { const biometricSupported = process.platform === 'darwin' && safeStorage.isEncryptionAvailable() && systemPreferences.canPromptTouchID(); return { configured: !!setting('salt'), unlocked: !!vaultKey, platform: process.platform, biometricSupported, biometricAvailable: biometricSupported && fs.existsSync(wrapPath()) }; }
function lock() { if (vaultKey) vaultKey.fill(0); vaultKey = null; if (lastCopied && clipboard.readText() === lastCopied) clipboard.clear(); lastCopied = null; clearTimeout(clearClipboardTimer); BrowserWindow.getAllWindows().forEach(w => w.webContents.send('vault-locked')); }
function createWindow() {
  const iconPath = process.platform === 'win32' ? 'assets/platform/windows/AppIcon.ico' : process.platform === 'linux' ? 'assets/platform/linux/hicolor/256x256/apps/secret-store.png' : 'assets/icon.png';
  const window = new BrowserWindow({ width: 960, height: 720, minWidth: 940, minHeight: 650, backgroundColor: nativeTheme.shouldUseDarkColors ? '#11161e' : '#f7f9fc', titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', icon: path.join(__dirname, iconPath), webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.loadFile(path.join(__dirname, 'index.html'));
  window.on('closed', () => { if (!BrowserWindow.getAllWindows().length) lock(); });
  window.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' }; });
}
app.whenReady().then(() => {
  updateDockIcon();
  nativeTheme.on('updated', () => { updateDockIcon(); updateWindowBackgrounds(); });
  database();
  ipcMain.handle('status', () => status());
  ipcMain.handle('set-theme', (_, preference) => { if (!['light', 'dark', 'system'].includes(preference)) throw new Error('Invalid theme'); nativeTheme.themeSource = preference; updateDockIcon(); updateWindowBackgrounds(); return true; });
  ipcMain.handle('setup', async (_, password) => {
    if (setting('salt')) throw new Error('Vault already exists');
    if (typeof password !== 'string' || password.length < 12) throw new Error('Use at least 12 characters');
    const salt = crypto.randomBytes(24);
    vaultKey = await derive(password, salt);
    setSetting('salt', salt.toString('base64'));
    setSetting('verifier', checkKey(vaultKey));
    return status();
  });
  ipcMain.handle('unlock', async (_, password) => {
    if (Date.now() < nextAttempt) throw new Error(`Try again in ${Math.ceil((nextAttempt - Date.now()) / 1000)} seconds`);
    if (typeof password !== 'string') throw new Error('Invalid password');
    const candidate = await derive(password, Buffer.from(setting('salt'), 'base64'));
    const expected = Buffer.from(setting('verifier'), 'hex');
    const actual = Buffer.from(checkKey(candidate), 'hex');
    if (!crypto.timingSafeEqual(expected, actual)) {
      candidate.fill(0); failedAttempts++; nextAttempt = Date.now() + Math.min(30000, 1000 * 2 ** Math.min(failedAttempts, 5));
      throw new Error('Incorrect password');
    }
    if (vaultKey) vaultKey.fill(0);
    vaultKey = candidate; failedAttempts = 0; nextAttempt = 0;
    return entries();
  });
  ipcMain.handle('lock', () => { lock(); return status(); });
  ipcMain.handle('list', () => entries());
  ipcMain.handle('list-platforms', () => customPlatforms());
  ipcMain.handle('add-platform', (_, value) => {
    locked();
    const name = validatePlatformName(value);
    const existing = customPlatforms().find(x => x.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) return existing;
    database().prepare('INSERT INTO platforms(id,payload) VALUES(?,?)').run(crypto.randomUUID(), encrypt({ name }));
    return name;
  });
  ipcMain.handle('save', (_, input) => {
    locked(); const entry = validateEntry(input);
    database().prepare('INSERT INTO entries(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(entry.id, encrypt(entry));
    return entry;
  });
  ipcMain.handle('delete', (_, id) => { locked(); database().prepare('DELETE FROM entries WHERE id=?').run(String(id)); return true; });
  ipcMain.handle('copy', (_, value) => {
    locked(); if (typeof value !== 'string' || value.length > 20000) throw new Error('Invalid copy value');
    clipboard.writeText(value); lastCopied = value; clearTimeout(clearClipboardTimer);
    clearClipboardTimer = setTimeout(() => { if (clipboard.readText() === value) clipboard.clear(); lastCopied = null; }, 30000);
    return true;
  });
  ipcMain.handle('test', async (_, entry) => { locked(); return testKey(entry); });
  ipcMain.handle('enable-biometric', async () => {
    locked(); if (process.platform !== 'darwin' || !safeStorage.isEncryptionAvailable()) throw new Error('Biometric unlock is unavailable on this device');
    await systemPreferences.promptTouchID('Enable Touch ID unlock for Secret Store');
    fs.writeFileSync(wrapPath(), safeStorage.encryptString(vaultKey.toString('base64')), { mode: 0o600 });
    return status();
  });
  ipcMain.handle('biometric-unlock', async () => {
    if (!fs.existsSync(wrapPath())) throw new Error('Biometric unlock is not configured');
    await systemPreferences.promptTouchID('Unlock Secret Store');
    vaultKey = Buffer.from(safeStorage.decryptString(fs.readFileSync(wrapPath())), 'base64');
    if (checkKey(vaultKey) !== setting('verifier')) { lock(); throw new Error('Biometric credential is invalid'); }
    return entries();
  });
  ipcMain.handle('disable-biometric', () => { locked(); fs.rmSync(wrapPath(), { force: true }); return status(); });
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', lock);
