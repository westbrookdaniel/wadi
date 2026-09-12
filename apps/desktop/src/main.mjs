import { app, BrowserWindow, ipcMain, protocol, net, shell, safeStorage, session, dialog, Menu } from 'electron';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';
import { createMediaService } from './media.mjs';
import { createUpdates } from './updates.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await readFile(join(here, '../desktop-config.json'), 'utf8'));
const origin = new URL(config.origin).origin;
const legacyUserData = join(app.getPath('appData'), '@wadi/desktop');
app.setName('Wadi');
if (existsSync(legacyUserData)) app.setPath('userData', legacyUserData);
protocol.registerSchemesAsPrivileged([{ scheme: 'wadi', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
let updates;
let window, media, token = null, authServer = null, cancelSignIn = null;
const tokenFile = () => join(app.getPath('userData'), 'session.enc');
async function saveToken(value) {
  if (value && (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text'))) throw new Error('Unlock an OS keyring before signing in. Wadi will not store an unencrypted session.');
  if (value) { await mkdir(app.getPath('userData'), { recursive: true }); await writeFile(tokenFile(), safeStorage.encryptString(value), { mode: 0o600 }); }
  else await rm(tokenFile(), { force: true });
  token = value;
}
async function api(path, options = {}) {
  if (!/^\/api\/[a-z0-9/_%?.=&:+-]+$/i.test(path) || path.includes('..')) throw new Error('Invalid API path');
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error('Invalid API origin');
  const method = z.enum(['GET','POST','PUT','DELETE']).parse(options.method ?? 'GET');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  if (body && body.length > 1024*1024) throw new Error('Request too large');
  const response = await fetch(url, { method, headers, body, redirect: 'error', signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  if (response.status === 401 || (path === '/api/auth/logout' || path === '/api/account' && method === 'DELETE') && response.ok) await saveToken(null);
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { return { status: 503, body: { error: 'Wadi is temporarily unavailable. Please try again.' } }; }
  return { status: response.status, body: data };
}
function trusted(event) {
  if (event.sender !== window?.webContents || !event.senderFrame || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith('wadi://app/')) throw new Error('Untrusted caller');
}
async function openExternal(url) {
  const value = z.string().max(10000).parse(url);
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (!scheme || ['javascript','data','vbscript','file','shell','powershell','cmd','ms-settings'].includes(scheme)) throw new Error('Unsupported player link');
  const known = ['https','http','vlc','vlc-x-callback','iina','mpv','infuse','open-vidhub','outplayer','moonplayer','cineultra'];
  if (!known.includes(scheme)) {
    const result = await dialog.showMessageBox(window, { type:'question', buttons:['Cancel','Open player'], defaultId:0, cancelId:0, message:`Open this ${scheme} link in another app?` });
    if (result.response !== 1) return;
  }
  await shell.openExternal(value);
}
async function signIn() {
  cancelSignIn?.(new Error('Sign-in restarted'));
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return new Promise((resolveSignIn, reject) => {
    let finishing = false, settled = false;
    const finish = (error) => { if (settled) return; settled = true; clearTimeout(timer); server.close(); if (authServer === server) { authServer = null; cancelSignIn = null; } error ? reject(error) : resolveSignIn(true); };
    cancelSignIn = finish;
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method !== 'GET' || url.pathname !== '/callback' || url.searchParams.get('state') !== state || finishing) { res.writeHead(400); res.end('Invalid callback'); return; }
      finishing = true;
      try {
        const result = await api('/api/auth/desktop/exchange', { method: 'POST', body: { code: url.searchParams.get('code'), verifier } });
        const credentials = z.object({ token: z.string().min(32) }).parse(result.body);
        if (result.status !== 200) throw new Error('Sign-in failed');
        if (settled) { res.end('This sign-in was restarted. Use the newest browser tab.'); return; }
        await saveToken(credentials.token);
        res.writeHead(303, { Location: new URL('/desktop/connected', origin).href, 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'Content-Security-Policy': "default-src 'none'" });
        res.end();
        window?.show(); window?.focus(); finish();
      } catch (error) { res.writeHead(400); res.end('Sign-in failed. Return to Wadi and try again.'); finish(error); }
    });
    const timer = setTimeout(() => finish(new Error('Sign-in timed out')), 180000);
    authServer = server;
    server.once('error', finish);
    server.listen(0, '127.0.0.1', () => {
      const url = new URL('/desktop/connect', origin);
      url.searchParams.set('challenge', challenge); url.searchParams.set('state', state); url.searchParams.set('port', String(server.address().port));
      void shell.openExternal(url.href).catch(finish);
    });
  });
}
async function startDesktop() {
if (process.platform === 'darwin') {
  app.dock?.setIcon(join(here, '../resources/icon-mac.png'));
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Wadi', submenu: [{ role: 'about' }, { label: 'Check for Updates…', click: () => void updates?.check(true) }, { label: 'Settings…', accelerator: 'Command+,', click: () => { window?.show(); window?.focus(); window?.webContents.send('open-settings'); } }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]));
}

try { if (safeStorage.isEncryptionAvailable()) token = safeStorage.decryptString(await readFile(tokenFile())); } catch { /* First launch or unavailable keyring. */ }
const root = resolve(here, '../dist');
protocol.handle('wadi', async request => {
  const url = new URL(request.url);
  if (url.hostname !== 'app') return new Response('', { status: 403 });
  let path = resolve(root, '.' + decodeURIComponent(url.pathname));
  if (path !== root && !path.startsWith(root + sep)) return new Response('', { status: 403 });
  if (!extname(path)) path = join(root, 'index.html');
  const response = await net.fetch(pathToFileURL(path).href);
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: data: blob:; font-src 'self' data:; connect-src 'self' https: http:; media-src 'self' http://127.0.0.1:* blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'");
  return new Response(response.body, { status: response.status, headers });
});
session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) =>
  permission === 'fullscreen' && webContents === window?.webContents && details.isMainFrame && requestingOrigin === 'wadi://app');
session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) =>
  callback(permission === 'fullscreen' && webContents === window?.webContents && details.isMainFrame && details.requestingUrl.startsWith('wadi://app/')));
media = await createMediaService({ directory: join(app.getPath('userData'), 'media-cache'), binaries: app.isPackaged ? join(process.resourcesPath, 'media-bin') : join(here, '../assets') });
for (const [name, handler] of Object.entries({
  'open-page': path => shell.openExternal(new URL(z.enum(['/terms','/privacy']).parse(path), origin).href),
  'app-version': () => app.getVersion(),
  'update-state': () => updates?.state() ?? { kind: 'idle' },
  'update-check': () => updates.check(true),
  'update-download': () => updates.download(),
  session: () => Boolean(token),
  'sign-in': signIn,
  api: (path, options) => {
    if (typeof path !== 'string' || path.startsWith('/api/auth/') && !['/api/auth/me','/api/auth/logout'].includes(path)) throw new Error('Use browser sign-in');
    return api(path, options);
  },
  media: (action, payload) => media.command(action, payload),
  external: openExternal,
})) ipcMain.handle(name, (event, ...args) => { trusted(event); return handler(...args); });
window = new BrowserWindow({ icon: join(here, '../resources/icon.png'), titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 }, width: 1440, height: 900, minWidth: 760, minHeight: 520, backgroundColor:'#090909', autoHideMenuBar:true, webPreferences: { backgroundThrottling:false, preload: join(here,'preload.cjs'), nodeIntegration:false, contextIsolation:true, sandbox:true } });
window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('wadi://app/')) event.preventDefault(); });
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
await window.loadURL('wadi://app/');
updates = createUpdates({
  repository: config.releaseRepository || 'westbrookdaniel/wadi', currentVersion: app.getVersion(),
  platform: process.platform, arch: process.arch, enabled: app.isPackaged,
  openDownload: url => shell.openExternal(url),
  notify: state => { if (!window?.isDestroyed()) window.webContents.send('update-state', state); },
  feedback: message => dialog.showMessageBox(window, { type: 'info', title: 'Wadi updates', message, buttons: ['OK'] }),
});
if (process.platform !== 'darwin') Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Wadi', submenu: [{ label: 'Check for Updates…', click: () => void updates.check(true) }, { type: 'separator' }, { role: 'quit' }] }, { role: 'editMenu' }, { role: 'viewMenu' }]));
app.on('window-all-closed', () => app.quit());
let quitting = false;
app.on('before-quit', event => { if (quitting) return; event.preventDefault(); updates?.dispose(); quitting = true; authServer?.close(); void media.close().finally(() => app.exit(0)); });

}
void app.whenReady().then(startDesktop).catch(error => { console.error(error); app.exit(1); });
