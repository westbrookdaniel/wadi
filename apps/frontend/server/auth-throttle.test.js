import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './main.js';
import { createDatabase } from './database.js';
import { testDatabase } from './test-database.js';
import { authClientIp, authThrottle } from './auth-throttle.js';

const request = (ip = '192.0.2.1', headers = {}) => ({ socket: { remoteAddress: ip }, headers });
const response = () => ({ headers: {}, set(name, value) { this.headers[name] = value; } });

test('uses trusted ingress only, canonicalizes mapped IPv4 and groups IPv6 /64', () => {
  assert.equal(authClientIp(request('192.0.2.1', { 'x-forwarded-for': '198.51.100.1', 'x-vercel-forwarded-for': '198.51.100.2' }), false), '192.0.2.1');
  assert.equal(authClientIp(request('192.0.2.1', { 'x-vercel-forwarded-for': '198.51.100.2' }), true), '198.51.100.2');
  assert.equal(authClientIp(request('192.0.2.1', { 'x-vercel-forwarded-for': 'bad, 198.51.100.2' }), true), '192.0.2.1');
  assert.equal(authClientIp(request('::ffff:192.0.2.1')), '192.0.2.1');
  assert.equal(authClientIp(request('2001:db8:abcd:0001::12')), authClientIp(request('2001:db8:abcd:1:ffff::99')));
});

test('shared concurrent account limits, retry backoff, expiry and bounded cardinality', async t => {
  const database = await testDatabase(t), db = createDatabase(database), other = createDatabase(database);
  t.after(async () => { await db.close(); await other.close(); });
  let time = Date.now();
  const first = authThrottle(db, { clock: () => time }), second = authThrottle(other, { clock: () => time });
  const outcomes = await Promise.allSettled(Array.from({ length: 16 }, (_, i) => (i % 2 ? first : second)(request(`192.0.2.${i}`), response(), i % 2 ? 'Alice@example.com' : 'alice@example.com')));
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 10);
  assert.equal(outcomes.filter(value => value.status === 'rejected' && value.reason.status === 429).length, 6);
  const res = response();
  await assert.rejects(first(request(), res, 'alice@example.com'), { status: 429 });
  assert.equal(res.headers['Retry-After'], '900');
  time += 899000;
  await assert.rejects(first(request(), res, 'alice@example.com'), { status: 429 });
  assert.equal(res.headers['Retry-After'], '1');
  time += 1000;
  await first(request(), response(), 'alice@example.com');
  const bounded = authThrottle(db, { clock: () => time, capacity: 2 });
  await assert.rejects(bounded(request(), response(), 'another@example.com'), { status: 429 });
  assert.equal(Number((await db.get("SELECT count(*) AS count FROM integration_rate_limits WHERE key LIKE 'auth:%'")).count), 2);
  assert.ok((await db.all("SELECT key FROM integration_rate_limits WHERE key LIKE 'auth:%'")).every(row => !row.key.includes('alice') && !row.key.includes('192.0')));
});

test('IP budget covers rotating accounts and both login and registration', async t => {
  const db = createDatabase(await testDatabase(t)); t.after(() => db.close());
  const throttle = authThrottle(db);
  for (let i = 0; i < 60; i++) await throttle(request(), response(), `user${i}@example.com`, i % 2 === 0);
  await assert.rejects(throttle(request(), response(), 'new@example.com'), { status: 429 });
  await throttle(request('192.0.2.2'), response(), 'new@example.com');
});

test('HTTP login and registration reject before Argon2 and expose Retry-After', async t => {
  let hashes = 0, verifies = 0;
  const { app, db } = createApp({ database: await testDatabase(t), sendVerificationEmail: async () => {}, passwordHashers: { hash: async () => { hashes++; return 'test-hash'; }, verify: async () => { verifies++; return false; } } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); server.close(); await db.close(); });
  await db.run("INSERT INTO users(id,email,password_hash,email_verified_at) VALUES('test','login@example.com','unused',?)", new Date().toISOString());
  const post = (route, email, password = 'incorrect-password') => fetch(`http://127.0.0.1:${server.address().port}/api/auth/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal((await post('login', 'invalid', 'short')).status, 400);
  for (let i = 0; i < 10; i++) assert.equal((await post('login', 'LOGIN@example.com')).status, 401);
  const blocked = await post('login', 'login@example.com');
  assert.equal(blocked.status, 429); assert.ok(Number(blocked.headers.get('retry-after')) > 0); assert.equal(verifies, 10);
  assert.equal((await post('register', 'register@example.com')).status, 202);
  const repeated = await post('register', 'REGISTER@example.com');
  assert.equal(repeated.status, 429); assert.equal(hashes, 1); assert.ok(Number(repeated.headers.get('retry-after')) <= 60);
  // Unknown and known accounts consume identical admission budgets.
  for (let i = 0; i < 10; i++) assert.equal((await post('login', 'missing@example.com')).status, 401);
  assert.equal((await post('login', 'missing@example.com')).status, 429);
  assert.equal(verifies, 10);
});
