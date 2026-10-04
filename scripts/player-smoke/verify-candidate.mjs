import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const desktopRequire = createRequire(resolve('apps/desktop/package.json'));
const builderRequire = createRequire(desktopRequire.resolve('electron-builder'));
const asar = createRequire(builderRequire.resolve('app-builder-lib'))('@electron/asar');
const [app,bundle] = process.argv.slice(2);
if(!app||!bundle)throw new Error('Pass sealed QA app and source bundle');
const archive=join(resolve(app),'Contents/Resources/app.asar');
const revision=(await readFile(join(bundle,'REVISION'),'utf8')).trim();
if(asar.extractFile(archive,'REVISION').toString().trim()!==revision)throw new Error('Launched app revision mismatch');
let files=0;
for(const line of (await readFile(join(bundle,'SHA256SUMS'),'utf8')).trim().split('\n')) {
  const [expected,name]=line.split('  ');
  if(name==='launch.mjs'||name==='app/desktop-config.json'||(name.startsWith('node_modules/zod/')&&/\.(js|cjs|mjs)$/.test(name)&&!/(?:^|\/)(tests?|__tests__)\//.test(name))||/^app\/(src|dist|resources)\//.test(name)&&!name.endsWith('.test.mjs')) {
    const actual=createHash('sha256').update(asar.extractFile(archive,name)).digest('hex');
    if(actual!==expected)throw new Error(`Sealed QA module mismatch: ${name}`);
    files++;
  }
}
if(files<10)throw new Error('Missing production module identity checks');
const manifest=JSON.parse(asar.extractFile(archive,'package.json'));
const expectedManifest=JSON.parse(await readFile(join(bundle,'package.json'),'utf8'));
if(manifest.main!==expectedManifest.main||manifest.version!==expectedManifest.version||manifest.dependencies?.zod!=='4.3.6')throw new Error('Sealed QA entry/version/dependency mismatch');
const media={};for(const name of ['ffmpeg','ffprobe'])media[name]=createHash('sha256').update(await readFile(join(app,'Contents/Resources/media-bin',name))).digest('hex');
console.log(JSON.stringify({revision,files,archive,media,main:manifest.main,zod:manifest.dependencies.zod}));
