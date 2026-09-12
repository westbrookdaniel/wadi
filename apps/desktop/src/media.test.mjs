import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createMediaService } from './media.mjs';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const binaries = join(dirname(fileURLToPath(import.meta.url)), '../assets');

for (const mode of ['audio', 'remux', 'video']) test(`${mode}: retains paused segments, bounds read-ahead and resumes the same session`, { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wadi-buffer-test-'));
  let service;
  const fixture = join(directory, 'source.mkv');
  const previousEncoder = process.env.WADI_VIDEO_ENCODER;
  process.env.WADI_VIDEO_ENCODER = 'libx264';
  const server = createServer(async (_req, res) => {
    const body = await readFile(fixture);
    res.writeHead(200, { 'Content-Type': 'video/x-matroska', 'Content-Length': body.length }); res.end(body);
  });
  try {
    await promisify(execFile)(join(binaries, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=64x64:rate=10:duration=180', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=180', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '40', '-c:a', mode === 'audio' ? 'ac3' : 'aac', '-y', fixture]);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    service = await createMediaService({ directory: join(directory, 'cache'), binaries });
    const id = randomUUID();
    const session = await service.command('start', { id, url: `http://127.0.0.1:${server.address().port}/source.mkv`, forceVideo: mode === 'video' });
    assert.equal(session.mode, mode);
    const playlist = async () => {
      const response = await fetch(session.url);
      assert.equal(response.status, 200);
      return response.text();
    };
    await sleep(1500);
    const paused = await playlist();
    assert.ok(!paused.includes('#EXT-X-ENDLIST'), 'must not convert the entire title while paused');
    const segments = [...paused.matchAll(/#EXTINF:([\d.]+)/g)];
    const seconds = segments.reduce((sum, match) => sum + Number(match[1]), 0);
    assert.ok(seconds >= 28 && seconds <= 40, `bounded initial buffer, got ${seconds}s`);
    await sleep(mode === 'video' ? 6500 : 1000);
    assert.equal(await playlist(), paused, 'the paused playlist must stay stable');
    const firstSegment = paused.match(/segment\d+\.ts/)[0];
    assert.equal((await fetch(new URL(firstSegment, session.url))).status, 200);
    await service.command('progress', { id, position: 24 });
    await sleep(1000);
    assert.notEqual(await playlist(), paused, 'advancing the playhead must release the converter');
    assert.deepEqual(await service.command('status', id), { error: null });
    await service.command('stop', id);
    assert.equal((await fetch(session.url)).status, 404);
    assert.deepEqual(await service.command('status', id), { error: 'Playback session ended' });
  } finally {
    await service?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
    if(previousEncoder === undefined) delete process.env.WADI_VIDEO_ENCODER; else process.env.WADI_VIDEO_ENCODER = previousEncoder;
  }
});
