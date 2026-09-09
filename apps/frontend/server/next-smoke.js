// Run after `pnpm build`. Uses a temporary database and local media only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const temporary = await mkdtemp(join(tmpdir(), 'wadi-next-'));
const media = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
const upstream = createServer((req, res) => {
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Accept-Ranges', 'bytes');
  if (req.headers.range) {
    res.writeHead(206, { 'Content-Range': 'bytes 4-9/36', 'Content-Length': 6 });
    res.end(media.subarray(4, 10));
  } else { res.setHeader('Content-Length', media.length); res.end(media); }
});
upstream.listen(0, '127.0.0.1');
await once(upstream, 'listening');
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  env: { ...process.env, DATABASE_URL: join(temporary, 'wadi.sqlite') }, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', data => { logs = (logs + data).slice(-4000); });
server.stderr.on('data', data => { logs = (logs + data).slice(-4000); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { ready = (await fetch(base + '/health', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    if (server.exitCode !== null) throw new Error(logs);
    await delay(200);
  }
  assert.ok(ready, logs);
  const register = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'next-smoke@example.com', password: 'test-password' }) });
  assert.equal(register.status, 201, await register.clone().text());
  const { token } = await register.json();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + '/api/auth/me', { headers })).status, 200);
  assert.equal((await fetch(base + '/api/auth/me')).status, 401);
  const progress = { media_type: 'series', media_id: 'test:series', video_id: 'test:series:3:11', position_seconds: 123, duration_seconds: 600 };
  assert.equal((await fetch(base + '/api/watch-progress', { method: 'PUT', headers, body: JSON.stringify(progress) })).status, 200);
  const saved = await (await fetch(base + '/api/continue-watching?limit=2.5', { headers })).json();
  assert.equal(saved.items[0].position_seconds, 123);
  const proxy = base + '/api/stream-proxy?url=' + encodeURIComponent(`http://127.0.0.1:${upstream.address().port}/media.mp4`);
  const response = await fetch(proxy, { headers: { ...headers, Range: 'bytes=4-9' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 4-9/36');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(await response.text(), '456789');
  const head = await fetch(proxy, { method: 'HEAD', headers });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '36');
  assert.equal(await head.text(), '');
  for (const route of ['/login', '/register', '/media/series/test%3Aseries?season=3&episode=test%3Aseries%3A3%3A11']) {
    const page = await fetch(base + route);
    assert.equal(page.status, 200, route);
    assert.match(await page.text(), /favicon.svg/);
  }
  console.info('Next production smoke passed: auth, progress, private byte ranges, HEAD, and deep links.');
} finally {
  const exited = server.exitCode === null ? once(server, 'exit') : Promise.resolve();
  server.kill('SIGTERM');
  await exited;
  upstream.closeAllConnections();
  await new Promise(resolve => upstream.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
