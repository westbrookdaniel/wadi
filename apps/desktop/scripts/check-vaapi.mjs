import { createMediaService } from '../src/media.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

if (process.platform !== 'linux') throw new Error('This opt-in hardware check requires Linux with a VA-API GPU.');
const execute = promisify(execFile);
const binaries = process.env.WADI_MEDIA_BIN_DIR || '/usr/bin';
const directory = await mkdtemp(join(tmpdir(), 'wadi-vaapi-'));
let media;
const server = createServer();
const previousEncoder = process.env.WADI_VIDEO_ENCODER;
try {
  const file = join(directory, 'source.mkv');
  await execute(join(binaries, 'ffmpeg'), ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=12', '-c:v', 'libx264', '-preset', 'ultrafast', file], { timeout: 30000 });
  const bytes = await readFile(file);
  server.on('request', (_req, res) => { res.writeHead(200, { 'Content-Length': bytes.length }); res.end(bytes); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  process.env.WADI_VIDEO_ENCODER = 'h264_vaapi';
  media = await createMediaService({ directory: join(directory, 'cache'), binaries });
  const id = randomUUID();
  const session = await media.command('start', { id, url: `http://127.0.0.1:${server.address().port}/source.mkv`, forceVideo: true });
  assert.deepEqual(await media.command('status', id), { error: null, encoder: 'h264_vaapi' }, 'must not silently fall back to software');
  const response = await fetch(session.url);
  assert.equal(response.status, 200);
  const segment = (await response.text()).match(/segment\d+\.ts/);
  assert.ok(segment, 'HLS playlist must contain a playable segment');
  await execute(join(binaries, 'ffmpeg'), ['-v', 'error', '-i', new URL(segment[0], session.url).href, '-f', 'null', '-'], { timeout: 30000 });
  console.log('PASS: Wadi generated HLS with h264_vaapi, without software fallback, and FFmpeg decoded the segment.');
} finally {
  await media?.close();
  server.closeAllConnections();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
  if (previousEncoder === undefined) delete process.env.WADI_VIDEO_ENCODER;
  else process.env.WADI_VIDEO_ENCODER = previousEncoder;
}
