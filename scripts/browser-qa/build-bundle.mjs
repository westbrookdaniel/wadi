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
// One versioned fixture generator for the web and desktop engines.
const fixtures = output + '-fixtures';
execFileSync(process.execPath, ['scripts/native-qa/build-fixtures.mjs', fixtures, process.env.WADI_QA_FFMPEG || 'apps/desktop/assets/ffmpeg']);
for (const name of ['multitrack.webm','fixture.webm','english.srt','french.srt','fixture.srt','english-alternate.srt']) await cp(join(fixtures, name), join(output, name));
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
