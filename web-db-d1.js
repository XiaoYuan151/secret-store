function d1(binding) {
  if (!binding) throw new Error('Set the DB D1 binding');
  const blob = value => value instanceof Uint8Array ? Array.from(value) : value;
  return {
    async init() {},
    async setting(name) { return (await binding.prepare('SELECT value FROM vault_settings WHERE name=?').bind(name).first())?.value; },
    async setup(salt, check) {
      try {
        await binding.batch([
          binding.prepare("INSERT INTO vault_settings(name,value) VALUES('salt',?)").bind(salt),
          binding.prepare("INSERT INTO vault_settings(name,value) VALUES('verifier',?)").bind(check)
        ]);
        return true;
      } catch (error) {
        if (await this.setting('salt')) return false;
        throw error;
      }
    },
    async list(table) { return (await binding.prepare(`SELECT payload FROM ${table}`).all()).results.map(row => new Uint8Array(row.payload)); },
    async save(table, id, payload) { await binding.prepare(`INSERT INTO ${table}(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`).bind(id, blob(payload)).run(); },
    async delete(id) { await binding.prepare('DELETE FROM vault_entries WHERE id=?').bind(id).run(); },
    async session(id) { const row = await binding.prepare('SELECT payload,last_active FROM vault_sessions WHERE id=?').bind(id).first(); return row && { payload: new Uint8Array(row.payload), last_active: row.last_active }; },
    async saveSession(id, payload, time) { await binding.prepare('INSERT INTO vault_sessions(id,payload,last_active) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_active=excluded.last_active').bind(id, blob(payload), time).run(); },
    async deleteSession(id) { await binding.prepare('DELETE FROM vault_sessions WHERE id=?').bind(id).run(); },
    async attempt(id) { return binding.prepare('SELECT count,until_time FROM vault_attempts WHERE id=?').bind(id).first(); },
    async saveAttempt(id, count, until) { await binding.prepare('INSERT INTO vault_attempts(id,count,until_time) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET count=excluded.count,until_time=excluded.until_time').bind(id, count, until).run(); },
    async deleteAttempt(id) { await binding.prepare('DELETE FROM vault_attempts WHERE id=?').bind(id).run(); }
  };
}
module.exports = { d1 };
