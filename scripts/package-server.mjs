import { createRequire, isBuiltin } from 'node:module';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = resolve(root, 'apps/frontend');
const standalone = resolve(app, '.next/standalone');
const dest = existsSync(resolve(standalone, 'apps/frontend/server.js')) ? resolve(standalone, 'apps/frontend') : standalone;
if (!existsSync(resolve(dest, 'server.js'))) throw new Error('Run pnpm build first');
mkdirSync(resolve(dest, '.next'), { recursive: true });
cpSync(resolve(app, 'public'), resolve(dest, 'public'), { recursive: true });
cpSync(resolve(app, '.next/static'), resolve(dest, '.next/static'), { recursive: true });
mkdirSync(resolve(dest, 'server'), { recursive: true });
for (const file of ['schema.sql', 'conversion-worker.mjs']) cpSync(resolve(app, 'server', file), resolve(dest, 'server', file));
// The worker is launched outside Next's module graph. Copy its dependency closure
// explicitly, including the current platform's native codec package.
const copied = new Map();
function copyPackage(name, from) {
  if (isBuiltin(name)) return;
  const require = createRequire(resolve(from, 'package.json'));
  const located = (require.resolve.paths(name) ?? []).map(path => resolve(path, name)).find(path => existsSync(resolve(path, 'package.json')));
  if (!located) throw new Error('Missing codec dependency: ' + name);
  const source = realpathSync(located);
  const pkg = JSON.parse(readFileSync(resolve(source, 'package.json'), 'utf8'));
  if (copied.has(name)) { if (copied.get(name) !== pkg.version) throw new Error('Conflicting codec dependency: ' + name); return; }
  copied.set(name, pkg.version);
  const target = resolve(dest, 'server/node_modules', name);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true, dereference: true, filter: path => path !== resolve(source, 'node_modules') });
  for (const dependency of Object.keys(pkg.dependencies ?? {})) copyPackage(dependency, source);
  for (const dependency of Object.keys(pkg.optionalDependencies ?? {})) {
    // NodeAV's WebRTC stack is not used for conversion. Include native packages only.
    if (!dependency.startsWith('@seydx/node-av-')) continue;
    if (!(require.resolve.paths(dependency) ?? []).some(path => existsSync(resolve(path, dependency, 'package.json')))) continue;
    copyPackage(dependency, source);
  }
}
copyPackage('mediabunny', app);
copyPackage('@mediabunny/server', app);
console.log('Standalone server prepared for this OS and CPU architecture. Start with pnpm start.');
