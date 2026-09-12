import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import ffmpeg from 'ffmpeg-static';
import ffprobe from 'ffprobe-static';
import { mkdir, copyFile, chmod, writeFile } from 'node:fs/promises';
const origin = new URL(process.env.WADI_WEB_ORIGIN ?? 'http://localhost:5173');
if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('WADI_WEB_ORIGIN must be an origin, without a path or credentials');
if (origin.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(origin.hostname)) throw new Error('Use HTTPS for the hosted app');
if (process.env.CI && origin.protocol !== 'https:') throw new Error('Release builds require an HTTPS WADI_WEB_ORIGIN');
await writeFile('desktop-config.json', JSON.stringify({ origin: origin.origin, updates: process.env.WADI_UPDATE_URL ?? null }));
await mkdir('assets', { recursive: true });
for (const [name, source] of [['ffmpeg', ffmpeg], ['ffprobe', ffprobe.path]]) {
  if (!source) throw new Error(`Missing ${name} for this platform`);
  const target = `assets/${name}${process.platform === 'win32' ? '.exe' : ''}`;
  await copyFile(source, target); await chmod(target, 0o755);
}

const require = createRequire(import.meta.url);
for (const [source, name] of [
  [join(dirname(ffmpeg), 'ffmpeg.LICENSE'), 'FFmpeg-LICENSE.txt'],
  [join(dirname(ffmpeg), 'ffmpeg.README'), 'FFmpeg-build-notes.txt'],
  [join(dirname(require.resolve('ffprobe-static')), 'LICENSE'), 'ffprobe-static-LICENSE.txt'],
  [join(dirname(require.resolve('ffprobe-static')), 'README.md'), 'ffprobe-static-README.txt'],
]) await copyFile(source, join('assets',name));
