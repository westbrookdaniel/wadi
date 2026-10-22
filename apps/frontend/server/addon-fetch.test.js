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
  const slow = assert.rejects(fetchAddonJson(base + '/hung', { allowPrivate: true, timeoutMs: 100 }), /took too long/);
  const fast = await fetchAddonJson(base + '/fast', { allowPrivate: true });
  assert.equal(fast.streams.length, 1);
  await slow;
});
