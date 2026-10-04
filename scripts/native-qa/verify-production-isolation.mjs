// Inspect finished production ASARs; never launch Electron or access credentials.
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assertProductionIsolation, productionModules } from './production-isolation.mjs';
const root = resolve(process.argv[2] || 'apps/desktop/release');
const desktopRequire = createRequire(resolve('apps/desktop/package.json'));
const builderRequire = createRequire(desktopRequire.resolve('electron-builder'));
const asar = createRequire(builderRequire.resolve('app-builder-lib'))('@electron/asar');
async function archives(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await archives(filename));
    else if (entry.isFile() && entry.name === 'app.asar') found.push(filename);
  }
  return found;
}
const expected = Object.fromEntries(await Promise.all(productionModules.map(async name => [name, await readFile(join('apps/desktop', name))])));
const packages = await archives(root);
if (!packages.length) throw new Error('No finished production ASAR found');
for (const archive of packages) {
  assertProductionIsolation({ files: asar.listPackage(archive), manifest: JSON.parse(asar.extractFile(archive, 'package.json')), extract: name => asar.extractFile(archive, name), expected });
  console.log(JSON.stringify({ archive, productionModules: productionModules.length, syntheticCredentials: 'absent' }));
}
