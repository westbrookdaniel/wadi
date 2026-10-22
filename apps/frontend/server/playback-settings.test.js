import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApp } from './main.js';
import { testDatabase } from './test-database.js';
import { defaultAutoPlayback } from '../shared/auto-playback.js';

test('playback defaults sync across sessions, isolate profiles and accounts, validate input, and export', async t => {
  let code;
  const { app, db } = createApp({ database: await testDatabase(t), sendVerificationEmail: async message => { code = message.code; } });
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); server.close(); await db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, token, method = 'GET', body, expected = 200) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(response.status, expected, path);
    return response.json();
  };
  const register = async email => {
    const pending = await request('/api/auth/register', null, 'POST', { email, password: 'test-password' }, 202);
    return request('/api/auth/verify-email', null, 'POST', { challenge: pending.challenge, code });
  };
  const alice = await register('alice@example.com'), bob = await register('bob@example.com');
  const path = `/api/profiles/${alice.active_profile_id}/playback-settings`;
  const other = await request('/api/profiles', alice.token, 'POST', { name: 'Other' }, 201);
  await request(path, null, 'GET', undefined, 401);
  await request(path, bob.token, 'GET', undefined, 404);
  await request(path, bob.token, 'PUT', defaultAutoPlayback, 404);
  await request(path, bob.token, 'DELETE', undefined, 404);
  assert.deepEqual(await request(path, alice.token), { settings: null });
  const settings = { ...defaultAutoPlayback, enabled: true, skipSelection: true, preferredResolution: 720, autoRecover: false, recoveryAttempts: 3, autoplayNext: true };
  assert.deepEqual(await request(path, alice.token, 'PUT', settings), { settings });
  const secondSession = await request('/api/auth/login', null, 'POST', { email: 'alice@example.com', password: 'test-password' });
  assert.deepEqual(await request(path, secondSession.token), { settings });
  await request('/api/profiles/select', alice.token, 'POST', { profile_id: other.id });
  assert.deepEqual(await request(`/api/profiles/${other.id}/playback-settings`, alice.token), { settings: null });
  // An in-flight save is explicitly addressed to its original profile, even after session selection changes.
  const updated = { ...settings, preferredResolution: 1080 };
  await request(path, alice.token, 'PUT', updated);
  assert.deepEqual(await request(`/api/profiles/${other.id}/playback-settings`, alice.token), { settings: null });
  for (const patch of [{ recoveryAttempts: 6 }, { startupTimeoutSeconds: 0 }, { autoRecover: 'yes' }, { preferredResolution: 9999 }, { cachedMode: 'only', cachedIndicator: ' ' }, { profile_id: bob.active_profile_id }]) {
    await request(path, alice.token, 'PUT', { ...settings, ...patch }, 400);
  }
  const exported = await request('/api/account/export', alice.token);
  assert.deepEqual(JSON.parse(exported.user_settings.find(row => row.profile_id === alice.active_profile_id).auto_playback_json), updated);
  await request(path, alice.token, 'DELETE');
  assert.deepEqual(await request(path, secondSession.token), { settings: null });
});
