import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createUpdates } from './updates.mjs';
function setup(overrides = {}) {
  const updater = new EventEmitter(), messages = [], states = [];
  let installs = 0, downloads = 0, checks = 0;
  updater.checkForUpdates = async () => { checks++; return { isUpdateAvailable: true, updateInfo: { version: '0.2.0' } }; };
  updater.downloadUpdate = async () => { downloads++; updater.emit('download-progress', { percent: 42 }); updater.emit('update-downloaded', { version: '0.2.0' }); };
  updater.quitAndInstall = () => { installs++; };
  const service = createUpdates({ updater, enabled: true, notify: s => states.push(s), feedback: async s => messages.push(s), confirmInstall: async () => true, prepareInstall: async () => {}, ...overrides });
  return { updater, service, messages, states, counts: () => ({ installs, downloads, checks }) };
}
test('downloads in the background, reports progress, and installs only explicitly', async t => {
  const f = setup(); t.after(() => f.service.dispose());
  assert.equal(f.updater.autoInstallOnAppQuit, false);
  assert.equal(f.updater.autoDownload, false);
  await f.service.check();
  assert.deepEqual(f.states.map(s => s.kind), ['checking', 'downloading', 'downloading', 'ready']);
  assert.equal(f.states[2].percent, 42);
  assert.equal(f.counts().installs, 0);
  await f.service.check(true);
  assert.equal(f.counts().checks, 1);
  await f.service.install(); assert.equal(f.counts().installs, 1);
});
test('declining playback interruption leaves the update ready', async t => {
  const f = setup({ confirmInstall: async () => false }); t.after(() => f.service.dispose());
  await f.service.check(); await f.service.install();
  assert.equal(f.counts().installs, 0); assert.equal(f.service.state().kind, 'ready');
});
test('failed download can be retried and concurrent checks do not duplicate it', async t => {
  const f = setup(); t.after(() => f.service.dispose());
  f.updater.downloadUpdate = async () => { throw new Error('network'); };
  await f.service.check(); assert.equal(f.service.state().kind, 'error');
  let finish;
  f.updater.downloadUpdate = () => new Promise(resolve => { finish = () => { f.updater.emit('update-downloaded', { version: '0.2.0' }); resolve(); }; });
  const pending = f.service.check(); await Promise.resolve();
  await f.service.check(); assert.equal(f.counts().checks, 2);
  finish(); await pending; assert.equal(f.service.state().kind, 'ready');
});
test('manual current and unsupported build checks give feedback without downloads', async t => {
  const f = setup(); t.after(() => f.service.dispose());
  f.updater.checkForUpdates = async () => ({ isUpdateAvailable: false });
  await f.service.check(true); assert.equal(f.service.state().kind, 'idle'); assert.match(f.messages[0], /up to date/); assert.equal(f.counts().downloads, 0);
  const dev = setup({ enabled: false, unavailableReason: 'Install a release build.' }); t.after(() => dev.service.dispose());
  await dev.service.check(true); assert.equal(dev.messages[0], 'Install a release build.'); assert.equal(dev.counts().checks, 0);
});
