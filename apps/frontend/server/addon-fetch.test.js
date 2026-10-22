import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { fetchAddonJson } from './addon-fetch.js';

test('a hung addon times out without delaying an independent fast addon', async t => {
  const upstream = createServer((req, res) => {
    if (req.url === '/fast') res.end(JSON.stringify({ streams: [{ url: 'https://example.test/video' }] }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  const base = `http://127.0.0.1:${upstream.address().port}`;
  const started = Date.now();
  const slow = assert.rejects(fetchAddonJson(base + '/hung', { allowPrivate: true, timeoutMs: 100 }), /took too long/);
  const fast = await fetchAddonJson(base + '/fast', { allowPrivate: true });
  assert.equal(fast.streams.length, 1);
  await slow;
  assert.ok(Date.now() - started < 1000, 'the configured per-addon deadline must be honored');
});

test('reports HTTP and HTTP-200 debrid failures without exposing credentials', async t => {
  const upstream = createServer((req, res) => {
    if (req.url.startsWith('/http/')) { res.writeHead(401); return res.end('secret-token'); }
    res.end(JSON.stringify({ success: false, error: 'TorBox AUTH_BAD_TOKEN', detail: 'https://provider.test/secret-token?api_key=secret-token' }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  t.after(() => { upstream.closeAllConnections(); upstream.close(); });
  const base = `http://127.0.0.1:${upstream.address().port}`;
  await assert.rejects(fetchAddonJson(base + '/http/secret-token', { allowPrivate: true }), error => /HTTP 401/.test(error.message) && !error.message.includes('secret-token'));
  await assert.rejects(fetchAddonJson(base + '/json/secret-token', { allowPrivate: true }), error => /TorBox: Authentication failed/.test(error.message) && !error.message.includes('secret-token'));
});
