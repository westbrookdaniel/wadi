import { createHash } from 'node:crypto';

export const productionModules = ['src/main.mjs', 'src/preload.cjs', 'src/media.mjs', 'src/updates.mjs', 'src/clipboard.mjs'];
export function assertProductionIsolation({ files, manifest, extract, expected }) {
  const names = files.map(name => name.replaceAll('\\', '/').replace(/^\/+/, ''));
  if (manifest.main !== 'src/main.mjs') throw new Error('Production entry is not the real main module');
  if (names.some(name => name === 'launch.mjs' || name.endsWith('/credential-adapter.mjs') || name === 'credential-adapter.mjs' || name.startsWith('scripts/native-qa/'))) throw new Error('Synthetic QA entry or credential adapter entered production package');
  for (const name of productionModules) {
    const hash = value => createHash('sha256').update(value).digest('hex');
    if (hash(extract(name)) !== hash(expected[name])) throw new Error(`Production module bytes changed: ${name}`);
  }
}
