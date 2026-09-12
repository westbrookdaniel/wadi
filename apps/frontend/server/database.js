import pg from 'pg';
import { databaseConfig } from './database-config.js';

// Small pool per warm Vercel instance. Use a pooled Railway URL for larger deployments.
export function createDatabase(connectionString) {
  if (!connectionString || !/^postgres(ql)?:/.test(connectionString)) throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  const pool = new pg.Pool({ ...databaseConfig(connectionString), max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000, allowExitOnIdle: true });
  const adapter = client => {
    const query = (sql, args) => {
      let index = 0;
      return client.query(sql.replace(/\?/g, () => `$${++index}`), args);
    };
    return {
      get: async (sql, ...args) => (await query(sql, args)).rows[0],
      all: async (sql, ...args) => (await query(sql, args)).rows,
      run: async (sql, ...args) => { await query(sql, args); },
    };
  };
  return { ...adapter(pool), close: () => pool.end(), transaction: async callback => {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const value = await callback(adapter(client)); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  } };
}
