import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { addIntroDbRoutes, parseSegments } from './introdb.js';

test('validates untrusted timestamps and preserves seconds and segment ends', () => {
  assert.deepEqual(parseSegments({ recap: { start_sec: 0, end_sec: 20.5 }, intro: { start_sec: 40, end_sec: 60 }, outro: { start_sec: 500, end_sec: 550 } }), [
    { type: 'recap', start: 0, end: 20.5 }, { type: 'intro', start: 40, end: 60 }, { type: 'outro', start: 500, end: 550 },
  ]);
  for (const value of [null, {}, { start_sec: -1, end_sec: 30 }, { start_sec: '0', end_sec: 30 }, { start_sec: 3, end_sec: 3 }, { start_sec: 0, end_sec: Infinity }]) assert.deepEqual(parseSegments({ intro: value }), []);
});

test('route validates IDs, caches requests, contains failures and forwards no credentials', async t => {
  const calls = []; let clock = 0; let response = { ok: true, json: async () => ({ intro: { start_sec: 2, end_sec: 40 } }) };
  const app = express();
  app.use((req, _res, next) => { req.user = { id: 'test-user' }; next(); });
  addIntroDbRoutes(app, { db: { get: async () => ({ introdb_enabled: true }) }, now: () => clock, fetchImpl: async (...args) => { calls.push(args); if (response instanceof Error) throw response; return response; } });
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/skip-segments?`;
  const query = 'imdb_id=tt0903747&season=1&episode=1';
  const get = params => fetch(base + params, { headers: { Authorization: 'Bearer private-wadi-token' } });
  for (const invalid of ['imdb_id=http://localhost&season=1&episode=1', 'imdb_id=tt0903747', query + '&season=2', query + '&is_movie=false', 'imdb_id=tt0903747&season=1&episode=0', query + '&is_movie=true']) assert.equal((await get(invalid)).status, 400);
  assert.equal(calls.length, 0);
  assert.deepEqual(await (await get(query)).json(), { items: [{ type: 'intro', start: 2, end: 40 }] });
  await get(query); assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://api.introdb.app/segments?' + query);
  assert.deepEqual(calls[0][1].headers, { Accept: 'application/json' });
  assert.ok(calls[0][1].signal instanceof AbortSignal);
  await get('imdb_id=tt0371746&is_movie=true'); assert.equal(calls.length, 2);
  for (const failure of [{ ok: false, status: 404 }, { ok: false, status: 429 }, new Error('offline'), { ok: true, json: async () => { throw new Error('bad JSON'); } }]) {
    clock += 3_600_001; response = failure;
    assert.deepEqual(await (await get(query)).json(), { items: [] });
    const count = calls.length; await get(query); assert.equal(calls.length, count);
  }
});

test('account opt-in defaults off, persists across devices, isolates users and gates cached segments', async t => {
  const enabled = new Map(); let calls = 0;
  const db = {
    get: async (_sql, id) => ({ introdb_enabled: enabled.get(id) ?? false }),
    run: async (_sql, value, id) => { enabled.set(id, value); },
  };
  const app = express(); app.use(express.json());
  // Authenticated identity normally comes from main.js's session middleware.
  app.use((req, res, next) => { if (!req.headers['x-test-user']) return res.sendStatus(401); req.user = { id: req.headers['x-test-user'] }; next(); });
  addIntroDbRoutes(app, { db, fetchImpl: async () => { calls++; return { ok: true, json: async () => ({ intro: { start_sec: 1, end_sec: 40 } }) }; } });
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, user = 'alice', value) => fetch(base + path, { method: value === undefined ? 'GET' : 'PUT', headers: { 'Content-Type': 'application/json', ...(user ? { 'x-test-user': user } : {}) }, body: value === undefined ? undefined : JSON.stringify(value) });
  const settings = '/api/settings/introdb', segments = '/api/skip-segments?imdb_id=tt0903747&season=1&episode=1';
  assert.equal((await request(settings, null)).status, 401);
  assert.deepEqual(await (await request(settings)).json(), { enabled: false });
  assert.deepEqual(await (await request(segments)).json(), { items: [] }); assert.equal(calls, 0);
  assert.equal((await request(settings, 'alice', { enabled: 'true' })).status, 400);
  assert.deepEqual(await (await request(settings, 'alice', { enabled: true, user_id: 'bob' })).json(), { enabled: true });
  assert.deepEqual(await (await request(settings)).json(), { enabled: true }, 'new request/device reads persisted preference');
  assert.deepEqual(await (await request(settings, 'bob')).json(), { enabled: false });
  assert.equal((await (await request(segments)).json()).items.length, 1); assert.equal(calls, 1);
  assert.deepEqual(await (await request(segments, 'bob')).json(), { items: [] }, 'another user cannot receive shared cached results while off');
  await request(settings, 'alice', { enabled: false });
  assert.deepEqual(await (await request(segments)).json(), { items: [] }); assert.equal(calls, 1);
});
