import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { testDatabase } from './test-database.js';

test('schema upgrades existing playback settings and preserves saved overrides when reapplied', async t => {
  const db = new pg.Client({ connectionString: await testDatabase(t) });
  await db.connect();
  t.after(() => db.end());
  // Recreate the settings shape used before profile playback defaults existed.
  await db.query('ALTER TABLE user_settings DROP COLUMN auto_playback_json');
  await db.query("INSERT INTO users (id, email, password_hash) VALUES ('viewer', 'viewer@example.test', 'unused')");
  await db.query("INSERT INTO profiles (id, user_id, name) VALUES ('profile', 'viewer', 'Viewer')");
  await db.query("INSERT INTO user_settings (user_id, profile_id, playback_prefs_json) VALUES ('viewer', 'profile', '{\"stream_action\":\"internal\"}')");
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await db.query(schema);
  const { rows: [settings] } = await db.query('SELECT auto_playback_json, playback_prefs_json FROM user_settings');
  assert.equal(settings.auto_playback_json, '{}');
  assert.deepEqual(JSON.parse(settings.playback_prefs_json), { stream_action: 'internal' });
  await assert.rejects(db.query('UPDATE user_settings SET auto_playback_json = NULL'), { code: '23502' });
  const override = JSON.stringify({ preferredResolution: 720 });
  await db.query('UPDATE user_settings SET auto_playback_json = $1', [override]);
  await db.query(schema);
  assert.equal((await db.query('SELECT auto_playback_json FROM user_settings')).rows[0].auto_playback_json, override);
});
