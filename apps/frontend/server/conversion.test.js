import { registerMediabunnyServer } from '@mediabunny/server';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Input, FilePathSource, ALL_FORMATS, Output, FilePathTarget, WebMOutputFormat, Conversion } from 'mediabunny';
import { addConversionRoutes } from './conversion.js';

test('conversion is gated, owned and produces range-served MP4', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wadi-conversion-'));
  registerMediabunnyServer();
  const source = new Input({ source: new FilePathSource(resolve('server/fixtures/playback.mp4')), formats: ALL_FORMATS });
  const output = new Output({ target: new FilePathTarget(join(directory, 'source.webm')), format: new WebMOutputFormat() });
  const seed = await Conversion.init({ input: source, output, video: { codec: 'vp9' }, audio: { codec: 'opus' } });
  await seed.execute(); source.dispose();
  const app = express(); app.use(express.json());
  app.get('/fixture', (_req, res) => res.sendFile(join(directory, 'source.webm')));
  app.use((req, res, next) => { if (!req.headers.authorization) return res.sendStatus(401); req.user = { id: req.headers.authorization }; next(); });
  const close = addConversionRoutes(app, { directory, enabled: true });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { authorization: 'owner', 'content-type': 'application/json' };
  try {
    assert.equal((await fetch(base + '/api/server-capabilities')).status, 401);
    assert.equal((await fetch(base + '/api/conversions', { method: 'POST', headers, body: JSON.stringify({ url: 'file:///etc/passwd' }) })).status, 400);
    const response = await fetch(base + '/api/conversions', { method: 'POST', headers, body: JSON.stringify({ url: base + '/fixture' }) });
    assert.equal(response.status, 202);
    const { id } = await response.json();
    assert.equal((await fetch(base + '/api/conversions/' + id, { headers: { authorization: 'other' } })).status, 404);
    let job;
    for (let n = 0; n < 120; n++) {
      job = await (await fetch(base + '/api/conversions/' + id, { headers })).json();
      if (job.status !== 'working') break;
      await delay(250);
    }
    assert.equal(job.status, 'ready', JSON.stringify(job));
    const input = new Input({ source: new FilePathSource(join(directory, 'conversion-cache', id + '.mp4')), formats: ALL_FORMATS });
    assert.equal((await input.getPrimaryVideoTrack()).codec, 'avc');
    assert.equal((await input.getPrimaryAudioTrack()).codec, 'aac');
    assert.ok(await input.computeDuration() > 0); input.dispose();
    const media = await fetch(base + '/api/conversions/' + id + '/media', { headers: { ...headers, range: 'bytes=0-31' } });
    assert.equal(media.status, 206); assert.equal((await media.arrayBuffer()).byteLength, 32);
    assert.equal((await fetch(base + '/api/conversions/' + id, { method: 'DELETE', headers })).status, 204);
    assert.equal((await fetch(base + '/api/conversions/' + id, { headers })).status, 404);
  } finally { close(); server.closeAllConnections(); await new Promise(done => server.close(done)); await rm(directory, { recursive: true, force: true }); }
  const disabled = express(); disabled.use(express.json()); const stop = addConversionRoutes(disabled, { directory, enabled: false });
  const host = disabled.listen(0, '127.0.0.1'); await once(host, 'listening');
  try { assert.equal((await fetch(`http://127.0.0.1:${host.address().port}/api/conversions`, { method: 'POST', headers, body: '{}' })).status, 403); }
  finally { stop(); host.closeAllConnections(); await new Promise(done => host.close(done)); }
});
