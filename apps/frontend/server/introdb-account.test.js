import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApp } from './main.js';
import { testDatabase } from './test-database.js';

test('IntroDB opt-in persists per account across sessions and profiles', async t => {
  let code;
  const { app, db } = createApp({ database: await testDatabase(t), sendVerificationEmail: async message => { code = message.code; } });
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); server.close(); await db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, token, method = 'GET', body, status = 200) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(res.status, status, path); return res.json();
  };
  const register = async email => {
    const pending = await request('/api/auth/register', null, 'POST', { email, password: 'test-password' }, 202);
    return request('/api/auth/verify-email', null, 'POST', { challenge: pending.challenge, code });
  };
  const alice = await register('alice@example.com'), bob = await register('bob@example.com');
  const settings = '/api/settings/introdb';
  await request(settings, null, 'GET', undefined, 401);
  assert.deepEqual(await request(settings, alice.token), { enabled: false });
  assert.deepEqual(await request('/api/skip-segments?imdb_id=tt0903747&season=1&episode=1', alice.token), { items: [] });
  await request(settings, alice.token, 'PUT', { enabled: 'yes' }, 400);
  await request(settings, alice.token, 'PUT', { enabled: true, user_id: bob.user.id });
  assert.deepEqual(await request(settings, bob.token), { enabled: false });
  const secondSession = await request('/api/auth/login', null, 'POST', { email: 'alice@example.com', password: 'test-password' });
  assert.deepEqual(await request(settings, secondSession.token), { enabled: true });
  const profile = await request('/api/profiles', alice.token, 'POST', { name: 'Other profile' }, 201);
  await request('/api/profiles/select', alice.token, 'POST', { profile_id: profile.id });
  assert.deepEqual(await request(settings, alice.token), { enabled: true });
  assert.equal((await request('/api/account/export', alice.token)).account.introdb_enabled, true);
  await request(settings, secondSession.token, 'PUT', { enabled: false });
  assert.deepEqual(await request(settings, alice.token), { enabled: false });
});
