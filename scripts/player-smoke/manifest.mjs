// Refresh the QA manifest after test-only packaging config/dependency assembly.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
const root = resolve(process.argv[2]);
async function files(path,prefix='') {
  const names=[];
  for(const entry of await readdir(path,{withFileTypes:true})) {
    if(entry.isDirectory())names.push(...await files(join(path,entry.name),prefix+entry.name+'/'));
    else if(entry.isFile() && prefix+entry.name !== 'SHA256SUMS')names.push(prefix+entry.name);
  }
  return names.sort();
}
const sums=[];
for(const name of await files(root))sums.push(`${createHash('sha256').update(await readFile(join(root,name))).digest('hex')}  ${name}`);
await writeFile(join(root,'SHA256SUMS'),sums.join('\n')+'\n');
