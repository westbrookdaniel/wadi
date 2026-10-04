import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
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
// Extract ADTS audio from generated MPEG-TS packets for the independent tone
// measurement. The pinned static FFmpeg 6.1.1 MPEG-TS input demuxer segfaults
// even on its own generated TS; the app renders these through Hls.js instead.
function audioPayload(ts) {
  const chunks = [];
  let audioPid = null, remaining = 0;
  for (let start=0;start+188<=ts.length;start+=188) {
    assert.equal(ts[start],0x47);
    const pid=((ts[start+1]&31)<<8)|ts[start+2], control=(ts[start+3]>>4)&3;
    if (!(control&1)) continue;
    let offset=start+4;
    if (control&2) offset+=1+ts[offset];
    const end=start+188;
    if (ts[start+1]&64) {
      if (offset+9>end || ts.readUIntBE(offset,3)!==1 || ts[offset+3]<0xc0 || ts[offset+3]>0xdf) continue;
      audioPid=pid;
      const header=ts[offset+8];
      remaining=ts.readUInt16BE(offset+4)-3-header;
      offset+=9+header;
    }
    if (pid!==audioPid || remaining<=0) continue;
    const length=Math.min(remaining,end-offset);
    chunks.push(ts.subarray(offset,offset+length)); remaining-=length;
  }
  assert.ok(chunks.length>0,'native segment must contain AAC audio');
  return Buffer.concat(chunks);
}

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
    if (mode !== 'remux') await assert.rejects(service.command('start', { id: randomUUID(), url: `http://127.0.0.1:${server.address().port}/source.mkv`, forceVideo: mode === 'video', conversionEnabled: false }), /Enable conversion in device settings/);
    const id = randomUUID();
    const session = await service.command('start', { id, url: `http://127.0.0.1:${server.address().port}/source.mkv`, forceVideo: mode === 'video', conversionEnabled: mode !== 'remux' });
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
    assert.deepEqual(await service.command('status', id), { error: null, encoder: mode === 'video' ? 'libx264' : 'copy' });
    await service.command('stop', id);
    assert.equal((await fetch(session.url)).status, 404);
    assert.deepEqual(await service.command('status', id), { error: 'Playback session ended' });
  } finally {
    await service?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
    if(previousEncoder === undefined) delete process.env.WADI_VIDEO_ENCODER; else process.env.WADI_VIDEO_ENCODER = previousEncoder;
  }
});

test('native conversion emits the chosen English/Japanese/default tone and retains requested offset', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wadi-track-test-'));
  const fixture = join(directory, 'tracks.mkv');
  const run = promisify(execFile);
  const ffmpeg = join(binaries, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  let service;
  const server = createServer(async (_req, res) => { const body = await readFile(fixture); res.writeHead(200, { 'Content-Length': body.length }); res.end(body); });
  try {
    await run(ffmpeg, ['-v','error','-f','lavfi','-i','testsrc2=size=64x64:rate=10:duration=120','-f','lavfi','-i','sine=frequency=440:duration=120','-f','lavfi','-i','sine=frequency=880:duration=120','-map','0:v','-map','1:a','-map','2:a','-c:v','libx264','-preset','ultrafast','-g','40','-c:a','ac3','-metadata:s:a:0','language=eng','-metadata:s:a:1','language=jpn',fixture]);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    service = await createMediaService({ directory: join(directory, 'cache'), binaries });
    for (const [audio, hz] of [['1',440],['2',880],[null,440],['2',880]]) {
      const id = randomUUID();
      const session = await service.command('start', { id, url: `http://127.0.0.1:${server.address().port}/tracks.mkv?synthetic=1`, audio, position:65 });
      assert.equal(session.offset, 65);
      assert.equal(session.selectedAudioTrackId, audio ?? '1');
      assert.deepEqual(session.audioTracks.map(track => track.language), ['eng','jpn']);
      const playlist = await (await fetch(session.url)).text();
      const segment = playlist.match(/segment\d+\.ts/)[0];
      const response = await fetch(new URL(segment, session.url));
      assert.equal(response.status, 200);
      const downloaded = join(directory, 'selected-track.aac');
      await writeFile(downloaded, audioPayload(Buffer.from(await response.arrayBuffer())));
      const { stdout } = await run(ffmpeg, ['-v','error','-f','aac','-i',downloaded,'-t','1','-vn','-ac','1','-ar','48000','-f','s16le','pipe:1'], { encoding:'buffer', maxBuffer:1024*1024 });
      // Hysteresis excludes codec noise around zero and initial decoder padding.
      let crossings = 0, negative = false;
      const firstSample = 12000, lastSample = Math.min(43200, stdout.length/2);
      for (let i=firstSample*2;i<lastSample*2;i+=2) {
        const sample = stdout.readInt16LE(i);
        if (sample < -500) negative = true;
        if (negative && sample > 500) { crossings++; negative = false; }
      }
      const observed = crossings / ((lastSample-firstSample) / 48000);
      assert.ok(Math.abs(observed-hz)<5, `expected ${hz} Hz, decoded ${observed} Hz`);
      await service.command('stop',id);
    }
  } finally {
    await service?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await rm(directory,{recursive:true,force:true});
  }
});
