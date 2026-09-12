import pg from '../apps/frontend/node_modules/pg/lib/index.js';
import { readFile } from 'node:fs/promises';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
if (!/^postgres(ql)?:/.test(process.env.DATABASE_URL ?? '')) throw new Error('Set DATABASE_URL to Railway Postgres');
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(await readFile(new URL('../apps/frontend/server/schema.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  console.log('Postgres schema applied');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
