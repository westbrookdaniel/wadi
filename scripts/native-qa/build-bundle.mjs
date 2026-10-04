// Cloud-only assembly after a clean commit and production desktop Vite build.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
const output = resolve(process.argv[2]);
const fixtures = resolve(process.argv[3]);
if (execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim()) throw new Error('Commit source before handoff');
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
await mkdir(output);
for (const name of ['src','dist','resources','package.json']) await cp(`apps/desktop/${name}`,join(output,'app',name),{recursive:true});
await cp('apps/desktop/node_modules/zod',join(output,'app/node_modules/zod'),{recursive:true,dereference:true});
await writeFile(join(output,'app/desktop-config.json'),JSON.stringify({origin:'http://127.0.0.1:4173',releaseRepository:'westbrookdaniel/wadi'}));
await writeFile(join(output,'package.json'),JSON.stringify({name:'wadi-native-synthetic-qa',version:JSON.parse(await readFile('apps/desktop/package.json')).version,private:true,type:'module',main:'launch.mjs'}));
for(const name of ['launch.mjs','credential-adapter.mjs','README.md']) await cp(`scripts/native-qa/${name}`,join(output,name));
await mkdir(join(output,'fixtures'));
await cp('scripts/browser-qa/server.mjs',join(output,'fixtures/server.mjs'));
for(const name of ['multitrack.webm','fixture.webm','english.srt','french.srt','fixture.srt','english-alternate.srt','index.html']) await cp(join(fixtures,name),join(output,'fixtures',name));
await writeFile(join(output,'REVISION'),revision+'\n');
execFileSync('git',['archive','--format=tar.gz','-o',join(output,'source.tar.gz'),revision]);
async function files(path,prefix='') {
 const names=[];
 for(const entry of await readdir(path,{withFileTypes:true})) {
  if(entry.isDirectory())names.push(...await files(join(path,entry.name),prefix+entry.name+'/'));
  else if(entry.isFile())names.push(prefix+entry.name);
 }
 return names.sort();
}
const sums=[];
for(const name of await files(output)) sums.push(`${createHash('sha256').update(await readFile(join(output,name))).digest('hex')}  ${name}`);
await writeFile(join(output,'SHA256SUMS'),sums.join('\n')+'\n');
console.log(JSON.stringify({revision,output,files:sums.length}));
