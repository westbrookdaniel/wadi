import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApiRequests } from './api-requests.mjs';

test('cancellation aborts the actual fetch, affects only its request and permits later requests', async t => {
  let arrived;
  const started = new Promise(resolve => { arrived = resolve; });
  const server = createServer((req, res) => { if (req.url === '/slow') arrived(); else res.end('ok'); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const requests = createApiRequests((path, options) => fetch(base + path, { signal: options.signal }));
  const id = randomUUID();
  const slow = requests.request('/slow', { requestId: id });
  const rejection = assert.rejects(slow, { name: 'AbortError' });
  await started;
  assert.equal(await (await requests.request('/fast')).text(), 'ok');
  requests.cancel(id);
  await rejection;
  requests.cancel(id);
  assert.throws(() => requests.cancel('../bad'));
  assert.equal(await (await requests.request('/fast')).text(), 'ok');
  requests.dispose();
});

test('dispose aborts pending requests and every settled request releases its controller', async () => {
  const signals = [];
  const requests = createApiRequests(async (_path, { signal }) => { signals.push(signal); return 'ok'; });
  const id = randomUUID();
  assert.equal(await requests.request('/api/health', { requestId: id }), 'ok');
  requests.cancel(id);
  assert.equal(signals[0].aborted, false);
  const pending = createApiRequests((_path, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
  const call = pending.request('/pending');
  const rejection = assert.rejects(call, { name: 'AbortError' });
  pending.dispose();
  await rejection;
});
