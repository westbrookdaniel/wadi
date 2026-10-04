import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { assertTrustedMainFrame, registerCopyStreamLink } from './clipboard.mjs';
function setup() {
  const mainFrame = { url: 'wadi://app/media/movie/qa-film' };
  const window = { webContents: { mainFrame } };
  const event = { sender: window.webContents, senderFrame: mainFrame };
  const writes = [], channels = [];
  let invoke;
  registerCopyStreamLink({ ipcMain: { handle: (channel, handler) => { channels.push(channel); invoke = handler; } }, clipboard: { writeText: text => writes.push(text) }, trusted: caller => assertTrustedMainFrame(caller, window) });
  return { window, event, writes, channels, invoke };
}
test('writes only the exact HTTP(S) stream URL, preserving signed query encoding', () => {
  const { invoke, event, writes, channels } = setup();
  const link = 'https://example.invalid/movie.webm?token=a%2Fb%2Bz&source=2';
  assert.equal(invoke(event, link), undefined);
  invoke(event, 'http://127.0.0.1:4173/multitrack.webm?source=1');
  assert.deepEqual(writes, [link, 'http://127.0.0.1:4173/multitrack.webm?source=1']);
  assert.deepEqual(channels, ['copy-stream-link']);
});
test('rejects untrusted windows, subframes, navigated origins and missing frames before writing', () => {
  const { invoke, event, writes, window } = setup();
  for (const caller of [{ ...event, sender: {} }, { ...event, senderFrame: { url: 'wadi://app/' } }, { ...event, senderFrame: null }]) {
    assert.throws(() => invoke(caller, 'https://example.invalid/a'), /Untrusted caller/);
  }
  for (const url of ['https://example.invalid/', 'wadi://app.evil/', 'wadi://app@evil/']) {
    window.webContents.mainFrame.url = url;
    assert.throws(() => invoke(event, 'https://example.invalid/a'), /Untrusted caller/);
  }
  assert.deepEqual(writes, []);
});
test('rejects arbitrary text, credential URLs, unsupported protocols and malformed payloads', () => {
  const { invoke, event, writes } = setup();
  for (const value of [null, {}, 42, '', 'hello', '/relative', 'https://', 'https://example.invalid/\nsecret', 'https://example.invalid/a b', 'https://user:pass@example.invalid/a', 'https://example.invalid/' + 'a'.repeat(10000), 'file:///tmp/a', 'javascript:alert(1)', 'data:text/plain,a', 'magnet:?xt=a', 'mpv://a', 'wadi://app/']) {
    assert.throws(() => invoke(event, value), /stream link/);
  }
  assert.throws(() => invoke(event, 'https://example.invalid/a', 'extra'), /Invalid stream link/);
  assert.deepEqual(writes, []);
});
test('propagates clipboard failure for the manual fallback', () => {
  let invoke;
  registerCopyStreamLink({ ipcMain: { handle: (_, handler) => { invoke = handler; } }, clipboard: { writeText: () => { throw new Error('OS denied'); } }, trusted: () => {} });
  assert.throws(() => invoke({}, 'https://example.invalid/a'), /OS denied/);
});
test('preload exposes a named write-only method guarded by user activation, never generic IPC or reads', async () => {
  const source = await readFile(new URL('./preload.cjs', import.meta.url), 'utf8');
  const calls = [], navigator = { userActivation: { isActive: false } };
  let bridge;
  runInNewContext(source, { navigator, require: name => {
    assert.equal(name, 'electron');
    return { contextBridge: { exposeInMainWorld: (name, api) => { assert.equal(name, 'wadiDesktop'); bridge = api; } }, ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve(); } } };
  } });
  assert.deepEqual(Object.keys(bridge).sort(), ['appVersion','getStartFullscreen','setStartFullscreen','onStartFullscreenChanged','updateState','checkUpdates','downloadUpdate','onUpdate','onOpenSettings','openPage','session','signIn','request','media','openExternal','copyStreamLink'].sort());
  await assert.rejects(bridge.copyStreamLink('https://example.invalid/a'), /user action/);
  assert.deepEqual(calls, []);
  navigator.userActivation.isActive = true;
  await bridge.copyStreamLink('https://example.invalid/a?source=2');
  assert.deepEqual(calls, [['copy-stream-link', 'https://example.invalid/a?source=2']]);
  delete navigator.userActivation;
  await assert.rejects(bridge.copyStreamLink('https://example.invalid/a'), /user action/);
});
