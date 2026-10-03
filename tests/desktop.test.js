const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

test('desktop vault encrypts records and unlocks persistently', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-store-test-'));
  const handlers = new Map();
  const fakeElectron = {
    app: { getPath: () => dir, whenReady: () => Promise.resolve(), on: () => {}, quit: () => {} },
    BrowserWindow: class { constructor() { this.webContents = { send: () => {}, setWindowOpenHandler: () => {} }; } loadFile() {} on() {} static getAllWindows() { return []; } },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    clipboard: { writeText: () => {}, readText: () => '', clear: () => {} },
    shell: { openExternal: () => {} },
    systemPreferences: { canPromptTouchID: () => false },
    safeStorage: { isEncryptionAvailable: () => false },
    nativeTheme: { shouldUseDarkColors: false, themeSource: 'system', on: () => {} }
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) { return request === 'electron' ? fakeElectron : originalLoad.call(this, request, parent, isMain); };
  try { require('../main.js'); } finally { Module._load = originalLoad; }
  await new Promise(resolve => setImmediate(resolve));
  const call = (name, value) => handlers.get(name)(null, value);
  assert.equal((await call('status')).configured, false);
  assert.equal(await call('set-theme', 'dark'), true);
  assert.equal(fakeElectron.nativeTheme.themeSource, 'dark');
  assert.throws(() => call('set-theme', 'invalid'), /Invalid theme/);
  await call('setup', 'correct horse battery staple');
  const entry = await call('save', { platform: 'GitHub', label: 'Test key', secret: 'test-secret-123', tags: ['Personal'], expiresAt: '2026-12-01' });
  assert.match(entry.id, /^[a-f0-9-]{36}$/);
  assert.equal((await call('list'))[0].secret, 'test-secret-123');
  assert.equal(fs.readFileSync(path.join(dir, 'vault.sqlite')).includes(Buffer.from('test-secret-123')), false);
  await call('lock');
  assert.throws(() => call('list'), /locked/);
  const unlocked = await call('unlock', 'correct horse battery staple');
  assert.equal(unlocked[0].secret, 'test-secret-123');
  await call('delete', entry.id);
  assert.deepEqual(await call('list'), []);
  await call('lock');
  await assert.rejects(call('unlock', 'wrong password'), /Incorrect password/);
  fs.rmSync(dir, { recursive: true, force: true });
});
