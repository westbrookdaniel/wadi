// Explicit one-time import. Does not modify the source SQLite file.
import { DatabaseSync } from 'node:sqlite';
import pg from '../apps/frontend/node_modules/pg/lib/index.js';
const path = process.argv[2];
if (!path || !process.env.DATABASE_URL) throw new Error('Usage: DATABASE_URL=… node scripts/import-sqlite.mjs /path/to/wadi.sqlite');
const source = new DatabaseSync(path, { readOnly: true });
const target = new pg.Client({ connectionString: process.env.DATABASE_URL });
await target.connect();
try {
  await target.query('BEGIN');
  const tables = ['users','profiles','sessions','addons','lists','list_items','watch_states','user_settings','player_settings'];
  for (const table of tables) {
    if (!source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
    if (Number((await target.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n)) throw new Error(`Target ${table} is not empty; import aborted`);
    for (const row of source.prepare(`SELECT * FROM ${table}`).all()) {
      // Normalize old SQLite timestamps to the same sortable UTC representation.
      for (const key of ['created_at','updated_at','installed_at','expires_at']) if (row[key]) row[key] = new Date(row[key].includes('T') ? row[key] : row[key].replace(' ', 'T')+'Z').toISOString();
      if (table === 'users') row.email = row.email.toLowerCase();
      const keys = Object.keys(row);
      await target.query(`INSERT INTO ${table} (${keys.map(key => '"'+key+'"').join(',')}) VALUES (${keys.map((_,i)=>'$'+(i+1)).join(',')})`, Object.values(row));
    }
  }
  await target.query('COMMIT');
  console.log('Imported existing accounts, addons and watch data');
} catch (error) { await target.query('ROLLBACK'); throw error; }
finally { source.close(); await target.end(); }
