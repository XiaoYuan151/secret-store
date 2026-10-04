const { Pool } = require('pg');

function postgres(url, serverless = false) {
  if (!url) throw new Error('Set DATABASE_URL');
  const pool = new Pool({ connectionString: url, max: serverless ? 1 : 8, idleTimeoutMillis: 30000 });
  return {
    async init() {
      await pool.query('CREATE TABLE IF NOT EXISTS vault_settings (name text PRIMARY KEY, value text NOT NULL)');
      await pool.query('CREATE TABLE IF NOT EXISTS vault_entries (id uuid PRIMARY KEY, payload bytea NOT NULL)');
      await pool.query('CREATE TABLE IF NOT EXISTS vault_platforms (id uuid PRIMARY KEY, payload bytea NOT NULL)');
      await pool.query('CREATE TABLE IF NOT EXISTS vault_sessions (id text PRIMARY KEY, payload bytea NOT NULL, last_active bigint NOT NULL)');
      await pool.query('CREATE TABLE IF NOT EXISTS vault_attempts (id text PRIMARY KEY, count integer NOT NULL, until_time bigint NOT NULL)');
    },
    async setting(name) { return (await pool.query('SELECT value FROM vault_settings WHERE name=$1', [name])).rows[0]?.value; },
    async setup(salt, check) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('LOCK TABLE vault_settings IN EXCLUSIVE MODE');
        if ((await client.query("SELECT 1 FROM vault_settings WHERE name='salt'")).rowCount) { await client.query('ROLLBACK'); return false; }
        await client.query('INSERT INTO vault_settings(name,value) VALUES($1,$2),($3,$4)', ['salt', salt, 'verifier', check]);
        await client.query('COMMIT'); return true;
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    },
    async list(table) { return (await pool.query(`SELECT payload FROM ${table}`)).rows.map(row => row.payload); },
    async save(table, id, payload) { await pool.query(`INSERT INTO ${table}(id,payload) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload`, [id, payload]); },
    async delete(id) { await pool.query('DELETE FROM vault_entries WHERE id=$1', [id]); },
    async session(id) { return (await pool.query('SELECT payload,last_active FROM vault_sessions WHERE id=$1', [id])).rows[0]; },
    async saveSession(id, payload, time) { await pool.query('INSERT INTO vault_sessions(id,payload,last_active) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload,last_active=EXCLUDED.last_active', [id, payload, time]); },
    async deleteSession(id) { await pool.query('DELETE FROM vault_sessions WHERE id=$1', [id]); },
    async attempt(id) { return (await pool.query('SELECT count,until_time FROM vault_attempts WHERE id=$1', [id])).rows[0]; },
    async saveAttempt(id, count, until) { await pool.query('INSERT INTO vault_attempts(id,count,until_time) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET count=EXCLUDED.count,until_time=EXCLUDED.until_time', [id, count, until]); },
    async deleteAttempt(id) { await pool.query('DELETE FROM vault_attempts WHERE id=$1', [id]); }
  };
}

module.exports = { postgres };
