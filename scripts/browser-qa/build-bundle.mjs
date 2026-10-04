// Run after a clean commit and `pnpm --filter frontend build` in the cloud.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
const output = resolve(process.argv[2] || '/tmp/wadi-browser-qa');
if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()) throw new Error('Commit source changes before building the QA handoff');
await mkdir(output); // Refuse to overwrite an existing handoff.
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await cp('apps/frontend/.next/static', join(output, 'static'), { recursive: true });
await cp('apps/frontend/public', output, { recursive: true });
await cp('apps/frontend/.next/server/pages/[[...path]].html', join(output, 'index.html'));
await cp('scripts/browser-qa/server.mjs', join(output, 'server.mjs'));
await cp('scripts/browser-qa/README.md', join(output, 'README.md'));
await writeFile(join(output, 'REVISION'), revision + '\n');
execFileSync('git', ['archive', '--format=tar.gz', '-o', join(output, 'source.tar.gz'), revision]);
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10:duration=120', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=120', '-c:v', 'libvpx-vp9', '-b:v', '150k', '-c:a', 'libopus', '-b:a', '32k', '-metadata:s:a:0', 'language=jpn', join(output, 'fixture.webm')]);
execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10:duration=120', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=120', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=120', '-map', '0:v:0', '-map', '1:a:0', '-map', '2:a:0', '-c:v', 'libvpx-vp9', '-b:v', '150k', '-c:a', 'libopus', '-b:a', '32k', '-metadata:s:a:0', 'language=eng', '-metadata:s:a:0', 'title=English 440 Hz', '-metadata:s:a:1', 'language=jpn', '-metadata:s:a:1', 'title=Japanese 880 Hz', join(output, 'multitrack.webm')]);
await writeFile(join(output, 'english.srt'), '1\n00:00:00,000 --> 00:02:00,000\nENGLISH QA CAPTION\n');
await writeFile(join(output, 'french.srt'), '1\n00:00:00,000 --> 00:02:00,000\nFRENCH QA CAPTION\n');
await writeFile(join(output, 'fixture.srt'), '1\n00:00:00,000 --> 00:02:00,000\nThe world is full of stories.\n');
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(join(directory, entry.name), name + '/'));
    else if (entry.isFile()) result.push(name);
  }
  return result.sort();
}
const sums = [];
for (const name of await files(output)) sums.push(`${createHash('sha256').update(await readFile(join(output, name))).digest('hex')}  ${name}`);
await writeFile(join(output, 'SHA256SUMS'), sums.join('\n') + '\n');
console.log(JSON.stringify({ revision, output, files: sums.length }));
