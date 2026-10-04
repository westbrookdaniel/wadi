// Test-only entry. Never included in the desktop package or production entrypoint.
import { app, ipcMain, safeStorage } from 'electron';
import { installSyntheticCredentials } from './credential-adapter.mjs';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
// Must precede importing main: startup probes safeStorage before session IPC.
// No original OS credential method may be reached by this synthetic process.
const credentials = installSyntheticCredentials(safeStorage);
const isolated = await mkdtemp(join(tmpdir(), 'wadi-native-qa-'));
await mkdir(join(isolated, 'appData'));
await mkdir(join(isolated, 'userData'));
app.setPath('appData', join(isolated, 'appData'));
app.setPath('userData', join(isolated, 'userData'));
const port = Number(process.env.WADI_QA_CDP_PORT || 9223);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid owned CDP port');
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
app.commandLine.appendSwitch('remote-debugging-port', String(port));
// Mock only authentication. Calling the production handler first retains its
// sender/frame validation. Media, clipboard, permissions and preload stay real.
const register = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (name, handler) => {
  if (name === 'session') {
    register(name, credentials.session(handler));
  } else if (name === 'media') {
    // Observe IDs/outcomes only. The original trusted production handler runs
    // unchanged, and every rejection is rethrown to Electron and the caller.
    register(name, async (event, ...args) => {
      const [action, payload] = args;
      const observed = action === 'start' || action === 'stop';
      const id = action === 'start' ? payload?.id : payload;
      const record = (outcome, message) => { if (observed) console.log(JSON.stringify({ qaMedia: { action, id, outcome, ...(message ? { message } : {}) } })); };
      record('called');
      try { const result = await handler(event, ...args); record('resolved'); return result; }
      catch (error) { record('rejected', String(error?.message ?? error)); throw error; }
    });
    // Production startup registers session before media, asynchronously after
    // main module evaluation. Restore only after both were captured.
    ipcMain.handle = register;
  } else register(name, handler);
};
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    const fixtureOrigin = 'http://127.0.0.1:4173';
    const seed = origin => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('wadi.auth.token', 'synthetic-qa-only');
      localStorage.setItem('wadi.auth.profile_id', 'qa-profile');
      sessionStorage.setItem('wadi.profile.selected_token', 'synthetic-qa-only');
      localStorage.setItem('wadi.device', JSON.stringify({state:{tvMode:false,askForProfile:false,theme:'dark',conversionEnabled:true},version:0}));
      for (const [key, source] of [['qa-session',1],['qa-session-b',2]]) {
        sessionStorage.setItem(`wadi.playback.qa-profile.${key}`, JSON.stringify({stream:{addon_id:'qa-addon',url:`${origin}/multitrack.webm?token=synthetic-only&source=${source}`,subtitles:[{id:'qa-en',lang:'eng',url:`${origin}/english.srt`},{id:'qa-fr',lang:'fra',url:`${origin}/french.srt`},{id:'qa-en-alt',lang:'eng',url:`${origin}/english-alternate.srt`}]},target:{mediaType:'movie',mediaId:'qa-film',videoId:null}}));
      }
      location.replace('/media/movie/qa-film?playback=qa-session');
    };
    try { await window.webContents.executeJavaScript(`(${seed.toString()})(${JSON.stringify(fixtureOrigin)})`); }
    catch (error) { console.error('QA seed failed', error); app.quit(); }
  });
});
console.log(JSON.stringify({ isolated, cdp:`http://127.0.0.1:${port}`, mocked:credentials.kind }));
await import(join(root, 'app/src/main.mjs'));
