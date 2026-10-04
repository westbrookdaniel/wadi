import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as url from 'node:url';
import { installSyntheticCredentials } from './credential-adapter.mjs';

// Evaluate the real QA entry and production main with isolated JS Electron/IO
// doubles. No Electron runtime, Keychain, filesystem credential or GUI access.
async function startup(useAdapter = true) {
  const calls = [], handlers = new Map(), paths = { appData: '/old', userData: '/old' };
  let ready, window;
  const safeStorage = Object.fromEntries(['isEncryptionAvailable', 'encryptString', 'decryptString', 'getSelectedStorageBackend', 'setUsePlainTextEncryption'].map(name => [name, () => { calls.push(['OS', name]); throw new Error('OS credential access forbidden by test'); }]));
  const ipcMain = { handle: (name, handler) => handlers.set(name, handler) };
  const app = {
    getPath: name => paths[name], setPath: (name, value) => { paths[name] = value; },
    setName() {}, dock: { setIcon() {} }, commandLine: { appendSwitch() {} },
    on() {}, whenReady: () => ({ then: callback => { ready = callback(); return ready; } }),
    getVersion: () => '0.1.12', isPackaged: true, quit() {}, exit: code => calls.push(['exit', code]),
  };
  class BrowserWindow {
    constructor() {
      window = this;
      this.webContents = { mainFrame: { url: 'wadi://app/' }, on() {}, setWindowOpenHandler() {}, send() {} };
    }
    async loadURL(value) { calls.push(['loadURL', value]); }
    isDestroyed() { return false; }
  }
  const fsPromises = {
    readFile: async filename => {
      calls.push(['readFile', filename]);
      if (filename.endsWith('desktop-config.json')) return JSON.stringify({ origin: 'http://127.0.0.1:4173' });
      throw new Error('ENOENT isolated fixture');
    },
    mkdtemp: async () => '/isolated-fixture', mkdir: async () => {},
    writeFile: async () => { throw new Error('Unexpected credential write'); }, rm: async () => {},
  };
  const context = vm.createContext({ console, URL, Response, Headers, Buffer, process: { platform: 'darwin', arch: 'arm64', argv: [], env: {}, resourcesPath: '/resources' } });
  const exported = values => new vm.SyntheticModule(Object.keys(values), function () {
    for (const [name, value] of Object.entries(values)) this.setExport(name, value);
  }, { context });
  const dependencies = {
    electron: exported({ app, BrowserWindow, ipcMain, safeStorage, protocol: { registerSchemesAsPrivileged() {}, handle() {} }, net: {}, shell: {}, session: { defaultSession: { setPermissionCheckHandler() {}, setPermissionRequestHandler() {} } }, dialog: {}, Menu: { buildFromTemplate: value => value, setApplicationMenu() {} }, clipboard: { writeText: value => calls.push(['clipboard', value]) } }),
    'node:fs': exported({ existsSync: () => false }), 'node:fs/promises': exported(fsPromises),
    'node:path': exported(path), 'node:url': exported(url), 'node:os': exported({ tmpdir: () => '/tmp' }),
    'node:http': exported({ createServer() { throw new Error('Unexpected real sign-in'); } }),
    'node:crypto': exported({ randomBytes() {}, createHash() {} }),
    zod: exported({ z: { enum: () => ({ parse: value => value }) } }),
    './media.mjs': exported({ createMediaService: async () => ({ command: (...args) => { calls.push(['media', ...args]); return 'real-handler-result'; } }) }),
    './updates.mjs': exported({ createUpdates: () => ({}) }),
    './credential-adapter.mjs': exported({ installSyntheticCredentials }),
  };
  const clipboard = new vm.SourceTextModule(await readFile('apps/desktop/src/clipboard.mjs', 'utf8'), { context });
  await clipboard.link(() => { throw new Error('Unexpected clipboard import'); });
  await clipboard.evaluate();
  dependencies['./clipboard.mjs'] = clipboard;
  const main = new vm.SourceTextModule(await readFile('apps/desktop/src/main.mjs', 'utf8'), { context, initializeImportMeta: meta => { meta.url = 'file:///fixture/app/src/main.mjs'; } });
  await main.link(name => { assert.ok(dependencies[name], name); return dependencies[name]; });
  let source = await readFile('scripts/native-qa/launch.mjs', 'utf8');
  if (!useAdapter) source = source.replace('const credentials = installSyntheticCredentials(safeStorage);', "const credentials = { kind: 'previous session-only mock', session: handler => (event, ...args) => { handler(event, ...args); return true; } };");
  const launch = new vm.SourceTextModule(source, {
    context, initializeImportMeta: meta => { meta.url = 'file:///fixture/launch.mjs'; },
    importModuleDynamically: async () => { await main.evaluate(); return main; },
  });
  await launch.link(name => { assert.ok(dependencies[name], name); return dependencies[name]; });
  await launch.evaluate(); await ready;
  return { calls, handlers, window, safeStorage, paths };
}

test('previous session-only QA mock reaches OS credential availability before the first window', async () => {
  const fixture = await startup(false);
  assert.deepEqual(fixture.calls.filter(call => call[0] === 'OS'), [['OS', 'isEncryptionAvailable']]);
  assert.ok(fixture.calls.findIndex(call => call[0] === 'OS') < fixture.calls.findIndex(call => call[0] === 'loadURL'));
});
test('real QA entry installs credentials before real production startup with no OS/token-file access', async () => {
  const fixture = await startup();
  assert.deepEqual(fixture.calls.filter(call => call[0] === 'OS'), []);
  assert.equal(fixture.calls.some(call => call[0] === 'readFile' && call[1].endsWith('session.enc')), false);
  assert.deepEqual(fixture.paths, { appData: '/isolated-fixture/appData', userData: '/isolated-fixture/userData' });
  assert.ok(fixture.calls.some(call => call[0] === 'loadURL' && call[1] === 'wadi://app/'));
  const event = { sender: fixture.window.webContents, senderFrame: fixture.window.webContents.mainFrame };
  assert.equal(fixture.handlers.get('session')(event), true);
  assert.throws(() => fixture.handlers.get('session')({}), /Untrusted caller/);
  assert.throws(() => fixture.handlers.get('copy-stream-link')({}, 'http://127.0.0.1:4173/example'), /Untrusted caller/);
  fixture.handlers.get('copy-stream-link')(event, 'http://127.0.0.1:4173/example?synthetic=1');
  assert.ok(fixture.calls.some(call => call[0] === 'clipboard' && call[1].endsWith('?synthetic=1')));
  assert.equal(await fixture.handlers.get('media')(event, 'status', 'synthetic-id'), 'real-handler-result');
  assert.equal(fixture.safeStorage.isEncryptionAvailable(), false);
  for (const name of ['encryptString', 'decryptString', 'getSelectedStorageBackend', 'setUsePlainTextEncryption']) assert.throws(() => fixture.safeStorage[name]('synthetic'), /Synthetic QA forbids/);
});
test('incompatible immutable credential API fails before replacing methods', () => {
  const original = () => { throw new Error('OS method must not run'); };
  const api = { isEncryptionAvailable: original };
  Object.defineProperty(api, 'encryptString', { value: original, writable: false, configurable: false });
  assert.throws(() => installSyntheticCredentials(api), /Cannot isolate synthetic credentials/);
  assert.equal(api.isEncryptionAvailable, original);
});
