const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('../web-core');

function memoryDb() {
  const settings = new Map();
  const entries = new Map();
  const platforms = new Map();
  const sessions = new Map();
  const attempts = new Map();
  return {
    async setting(name) { return settings.get(name); },
    async setup(salt, verifier) { if (settings.has('salt')) return false; settings.set('salt', salt); settings.set('verifier', verifier); return true; },
    async list(table) { return [...(table === 'vault_entries' ? entries : platforms).values()]; },
    async save(table, id, payload) { (table === 'vault_entries' ? entries : platforms).set(id, payload); },
    async delete(id) { entries.delete(id); },
    async session(id) { return sessions.get(id); },
    async saveSession(id, payload, time) { sessions.set(id, { payload, last_active: time }); },
    async deleteSession(id) { sessions.delete(id); },
    async attempt(id) { return attempts.get(id); },
    async saveAttempt(id, count, until) { attempts.set(id, { count, until_time: until }); },
    async deleteAttempt(id) { attempts.delete(id); }
  };
}
function request(action, data, cookie) {
  return new Request(`https://vault.example.com/api/${action}`, { method: data === undefined ? 'GET' : 'POST', headers: { origin: 'https://vault.example.com', 'x-csrf': '1', ...(cookie && { cookie }) }, body: data === undefined ? undefined : JSON.stringify(data) });
}
test('web vault shares encrypted sessions across instances and revokes on lock', async () => {
  const db = memoryDb();
  const options = { sessionSecret: 'a'.repeat(40), publicOrigin: 'https://vault.example.com', secure: true };
  const first = createApi(db, options);
  const second = createApi(db, options);
  const setup = await first(request('setup', { password: 'a long vault password' }));
  assert.equal(setup.status, 200);
  const cookie = setup.headers.get('set-cookie').split(';')[0];
  assert.match(setup.headers.get('set-cookie'), /HttpOnly.*Secure/);
  const entry = { label: 'GitHub', secret: 'sample-secret' };
  assert.equal((await second(request('save', entry, cookie))).status, 200);
  const list = await (await first(request('list', undefined, cookie))).json();
  assert.equal(list[0].secret, entry.secret);
  assert.equal((await second(request('lock', {}, cookie))).status, 200);
  assert.equal((await first(request('list', undefined, cookie))).status, 401);
  assert.equal((await first(request('setup', { password: 'another long password' }))).status, 409);
  assert.equal((await second(request('unlock', { password: 'wrong password' }))).status, 401);
  assert.equal((await second(request('unlock', { password: 'a long vault password' }))).status, 429);
});
