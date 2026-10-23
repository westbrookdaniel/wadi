import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { profileScope } from './profile-scope.js';

test('pins late reads and writes to the requested owned profile and rejects other accounts', async t => {
  const app = express();
  app.use((req, _res, next) => { req.user = { id: 'alice', profile_id: 'bob-profile' }; next(); });
  app.use(profileScope(async (_sql, id, user) => user === 'alice' && ['alice-profile', 'bob-profile'].includes(id) ? { id } : undefined));
  app.all(['/watch-data/movie/film', '/watch-progress', '/auth/me'], (req, res) => res.json({ profile: req.user.profile_id }));
  app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ error: err.message }));
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const [path, method] of [['/watch-data/movie/film', 'GET'], ['/watch-progress', 'PUT']]) {
    const response = await fetch(url + path, { method, headers: { 'X-Wadi-Profile': 'alice-profile' } });
    assert.deepEqual(await response.json(), { profile: 'alice-profile' });
    assert.equal((await fetch(url + path, { method, headers: { 'X-Wadi-Profile': 'other-account-profile' } })).status, 404);
  }
  assert.deepEqual(await (await fetch(url + '/auth/me', { headers: { 'X-Wadi-Profile': 'alice-profile' } })).json(), { profile: 'bob-profile' });
});
