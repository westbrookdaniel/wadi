// Test-only packaging config. Production package files/entry are untouched.
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const [directory] = process.argv.slice(2);
if (!directory) throw new Error('Pass cloud-built native QA bundle directory');
const root = resolve(directory);
const manifest = JSON.parse(await readFile(join(root, 'package.json')));
manifest.description = 'Isolated synthetic Wadi native QA candidate';
manifest.author = 'Wadi contributors';
manifest.license = 'MIT';
manifest.dependencies = { zod: '4.3.6' };
await cp(join(root, 'app/node_modules/zod'), join(root, 'node_modules/zod'), { recursive: true, dereference: true });
await writeFile(join(root, 'package.json'), JSON.stringify(manifest, null, 2));
const production = JSON.parse(await readFile('apps/desktop/package.json'));
const configuration = {
  appId: 'com.wadi.nativeqa', productName: 'Wadi', electronVersion: '41.10.7',
  // Prevent builder's conventional ./app autodetection from skipping the
  // wrapper entry; ./app here contains the unchanged production modules.
  directories: { app: root, output: resolve('apps/desktop/native-qa-release') },
  files: ['launch.mjs', 'app/src/**', '!app/src/**/*.test.mjs', 'app/dist/**', 'app/desktop-config.json', 'app/resources/**', 'package.json', 'REVISION'],
  extraResources: [{ from: resolve('apps/desktop/assets'), to: 'media-bin' }],
  mac: { ...production.build.mac, target: ['zip'], icon: resolve('apps/desktop/resources/icon-mac.png'), identity: '-', hardenedRuntime: false, notarize: false },
  artifactName: 'Wadi-NativeQA-${arch}.${ext}', publish: null,
};
await writeFile(join(root, 'electron-builder.json'), JSON.stringify(configuration, null, 2));
