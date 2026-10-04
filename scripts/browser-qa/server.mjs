// Synthetic, loopback-only browser QA. No database, credentials, providers or dependencies.
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const defaults = { subtitles_enabled: true, subtitle_language: null, subtitle_delay_seconds: 0, subtitle_size: 1.15, subtitle_position: 0, subtitle_text_color: '#FFFFFF', subtitle_background_color: '#000000', subtitle_background_opacity: 0, subtitle_outline_color: '#000000', subtitle_outline_style: 'outline', subtitle_outline_width: 1.5, subtitle_font_family: 'sans-serif', subtitle_offset_x: 0, subtitle_offset_y: 0, playback_speed: 1, preferred_audio_language: null, preferred_audio_track_id: null };
let watch = { media_type: 'movie', media_id: 'qa-film', video_id: null, watched: false, position_seconds: 60, duration_seconds: 120, updated_at: new Date().toISOString() };
let writes = [], delayWatchMs = 0;
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const meta = { id: 'qa-film', type: 'movie', name: 'Synthetic QA film', description: 'Generated colour bars and tone. No provider content.' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`), path = decodeURIComponent(url.pathname);
    // Prevent accidental remote calls, including Cast bootstrap and artwork.
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob:; font-src 'self' data:; worker-src 'self' blob:");
    let body = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      const chunks = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; if (length > 16384) return json(res, { error: 'Too large' }, 413); chunks.push(chunk); }
      const text = Buffer.concat(chunks).toString(); body = text ? JSON.parse(text) : {};
    }
    if (path === '/qa/state') return json(res, { watch, writes, delayWatchMs });
    if (path === '/qa/control' && req.method === 'POST') { if (Number.isFinite(body.position)) watch = { ...watch, position_seconds: body.position, updated_at: body.updated_at || new Date().toISOString() }; delayWatchMs = Math.max(0, Math.min(5000, Number(body.delayWatchMs) || 0)); if (body.clearWrites) writes = []; return json(res, { watch, delayWatchMs }); }
    if (path === '/qa/bootstrap') {
      const tracks = url.searchParams.get('tracks') === '1';
      const fixture = tracks ? '/multitrack.webm?token=synthetic-only&source=1' : '/fixture.webm';
      const captions = tracks ? [{ id: 'qa-en', lang: 'eng', url: '/english.srt' }, { id: 'qa-fr', lang: 'fra', url: '/french.srt' }] : [{ id: 'qa-en', lang: 'eng', url: '/fixture.srt' }];
      const sessionScript = (key, source) => `sessionStorage.setItem('wadi.playback.qa-profile.${key}',JSON.stringify({stream:{url:location.origin+${JSON.stringify(source)},subtitles:${JSON.stringify(captions)}.map(track=>({...track,url:location.origin+track.url}))},target:{mediaType:'movie',mediaId:'qa-film',videoId:null}}));`;
      const script = `localStorage.clear();sessionStorage.clear();localStorage.setItem('wadi.auth.token','synthetic-qa-only');localStorage.setItem('wadi.auth.profile_id','qa-profile');sessionStorage.setItem('wadi.profile.selected_token','synthetic-qa-only');localStorage.setItem('wadi.device',JSON.stringify({state:{tvMode:${url.searchParams.get('tv') === '1'},askForProfile:false,theme:'dark',conversionEnabled:true},version:0}));${sessionScript('qa-session', fixture)}${sessionScript('qa-session-b', '/multitrack.webm?token=synthetic-only&source=2')}${url.searchParams.get('legacy') === '1' ? `localStorage.setItem('wadi.device.player.v1',${JSON.stringify(JSON.stringify({ ...defaults, subtitle_size: 0.9, subtitle_outline_width: undefined }))});` : ''}location.replace(${JSON.stringify(url.searchParams.get('settings') === '1' ? '/settings' : '/media/movie/qa-film?playback=qa-session')});`;
      res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(`<html><body><script>${script}</script></body></html>`);
    }
    if (path === '/api/auth/me') return json(res, { id: 'qa-user', email: 'qa@example.invalid', active_profile_id: 'qa-profile' });
    if (path === '/api/profiles') return json(res, { items: [{ id: 'qa-profile', name: 'QA', avatar_key: 'avatar-1', user_id: 'qa-user' }] });
    if (path === '/api/profiles/select') return json(res, { active_profile_id: 'qa-profile' });
    if (path === '/api/auth/login' || path === '/api/auth/register') { res.setHeader('Retry-After', '900'); return json(res, { error: 'Too many sign-in attempts. Try again in 900 seconds.' }, 429); }
    if (path === '/api/settings/player-defaults') return json(res, defaults);
    if (path.startsWith('/api/settings/player-override/')) return json(res, {});
    if (path === '/api/settings/playback') return json(res, { stream_action: 'internal', external_player_preset: 'vlc', external_player_template: 'vlc://{url}' });
    if (path === '/api/settings/introdb') return json(res, { enabled: false });
    if (path === '/api/settings/browse-layout') return json(res, { pages: { home: { order: [], hidden: [] } } });
    if (path.startsWith('/api/watch-data/')) { if (delayWatchMs) await new Promise(resolve => setTimeout(resolve, delayWatchMs)); return json(res, { media_type: 'movie', media_id: 'qa-film', items: [watch] }); }
    if (path === '/api/watch-progress') { watch = { ...watch, ...body, updated_at: new Date().toISOString() }; writes.push({ position: body.position_seconds, updated_at: watch.updated_at }); return json(res, watch); }
    if (path.startsWith('/api/meta/')) return json(res, { responses: [{ addon_id: 'qa-addon', response: { meta } }] });
    if (path.startsWith('/api/subtitles/')) return json(res, { responses: [] });
    if (path.startsWith('/api/streams/')) return json(res, { responses: [{ addon_id: 'qa-addon', response: { streams: [{ name: 'QA', url: `http://127.0.0.1:${port}/fixture.webm` }] } }] });
    if (path.startsWith('/api/')) return json(res, { items: [] });
    let file = path.startsWith('/_next/static/') ? join(root, 'static', path.slice('/_next/static/'.length)) : join(root, path.slice(1));
    if (!resolve(file).startsWith(root + '/')) return json(res, {}, 403);
    let info = await stat(file).catch(() => null);
    if (!info?.isFile()) { file = join(root, 'index.html'); info = await stat(file); }
    const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.webm') ? 'video/webm' : file.endsWith('.srt') ? 'text/plain' : file.endsWith('.woff2') ? 'font/woff2' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(info.size - 1, Number(range[2])) : info.size - 1;
    if (start >= info.size || end < start) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
    res.writeHead(range ? 206 : 200, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}) });
    if (req.method === 'HEAD') res.end(); else createReadStream(file, { start, end }).pipe(res);
  } catch (error) { if (!res.headersSent) json(res, { error: String(error) }, 500); else res.destroy(); }
});
server.listen(port, '127.0.0.1', () => console.log(`Synthetic Wadi QA: http://127.0.0.1:${port}/qa/bootstrap`));
