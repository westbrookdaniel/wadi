import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
// Opt-in isolated schema in a developer-provided TEST_DATABASE_URL. Never use production.
export async function testDatabase(t) {
  if (!process.env.TEST_DATABASE_URL) throw new Error('Set TEST_DATABASE_URL to a disposable Postgres database');
  const schema='test_'+randomUUID().replaceAll('-','');
  const admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  t.after(async()=>{await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
  await admin.query(`SET search_path TO ${schema}`);
  await admin.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
  const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema}`);return url.href;
}
