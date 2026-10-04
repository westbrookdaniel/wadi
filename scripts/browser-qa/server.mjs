// Synthetic, loopback-only browser QA. No database, credentials, providers or dependencies.
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
export function createFixtureServer(root = dirname(fileURLToPath(import.meta.url))) {
let port;
const defaults = { subtitles_enabled: true, subtitle_language: null, subtitle_delay_seconds: 0, subtitle_size: 1.15, subtitle_position: 0, subtitle_text_color: '#FFFFFF', subtitle_background_color: '#000000', subtitle_background_opacity: 0, subtitle_outline_color: '#000000', subtitle_outline_style: 'outline', subtitle_outline_width: 1.5, subtitle_font_family: 'sans-serif', subtitle_offset_x: 0, subtitle_offset_y: 0, playback_speed: 1, preferred_audio_language: null, preferred_audio_track_id: null };
let watch = { media_type: 'movie', media_id: 'qa-film', video_id: null, watched: false, position_seconds: 60, duration_seconds: 120, updated_at: new Date().toISOString() };
const watchKey = body => JSON.stringify([body.media_type, body.media_id, body.video_id ?? null]);
const watches = new Map([[watchKey(watch), watch]]);
let writes = [], delayWatchMs = 0;
const unexpected = [], requests = [], held = new Map(), rules = {};
const completed = [];
const state = () => ({ watch, watches: [...watches.values()], writes, delayWatchMs, unexpected, requests, completed, pending: [...held.keys()] });
const json = (res, value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
const meta = { id: 'qa-film', type: 'movie', name: 'Synthetic QA film', description: 'Generated colour bars and tone. No provider content.' };
const episodes = [1,2].map(episode => ({ id:`qa-episode-${episode}`, title:`Synthetic episode ${episode}`, season:episode, episode, released:'2020-01-01', releasePrecision:'date', releaseState:'released', releaseConflicting:false, videoIds:[`qa-episode-${episode}`], addonIds:['qa-addon'], watched:false, position_seconds:0 }));
const metadata = { 'movie/qa-film': meta, 'movie/qa-film-b': { ...meta, id:'qa-film-b', name:'Synthetic second film' }, 'series/qa-show': { id:'qa-show', type:'series', name:'Synthetic QA show', description:meta.description, videos:episodes } };
const streamTargets = { 'movie/qa-film': [1,2], 'movie/qa-film-b': [3,4], 'series/qa-episode-1': [5,6], 'series/qa-episode-2': [7,8] };
for(const value of [{...watch,media_id:'qa-film-b',position_seconds:15},...episodes.map(episode=>({...watch,media_type:'series',media_id:'qa-show',video_id:episode.id,position_seconds:episode.episode===1?15:0}))])watches.set(watchKey(value),value);
const allowedRules = new Set(['/english.srt','/french.srt','/english-alternate.srt', ...Object.keys(metadata).map(key=>`/api/watch-data/${key}`), ...Object.keys(streamTargets).map(key=>`/api/streams/${key}`)]);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`), path = decodeURIComponent(url.pathname);
    let rule = {};
    if(!path.startsWith('/qa/'))res.once('close',()=>completed.push({path,at:Date.now()}));
    // Prevent accidental remote calls, including Cast bootstrap and artwork.
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' blob:; font-src 'self' data:; worker-src 'self' blob:");
    let body = {};
    if (req.method === 'POST' || req.method === 'PUT') {
      const chunks = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; if (length > 16384) return json(res, { error: 'Too large' }, 413); chunks.push(chunk); }
      const text = Buffer.concat(chunks).toString(); body = text ? JSON.parse(text) : {};
    }
    if (path === '/qa/state') return json(res, state());
    if (path === '/qa/control' && req.method === 'POST') {
      if (body.release) { for (const finish of held.get(body.release) || []) finish(); held.delete(body.release); }
      if (body.rules) { for (const [name, rule] of Object.entries(body.rules)) { if (!allowedRules.has(name)) return json(res, {error:'Unsupported fixture rule'}, 400); rules[name] = rule; } }
    }
    if (path === '/qa/control' && req.method === 'POST') { if (Number.isFinite(body.position)) { watch = { ...watch, position_seconds: body.position, updated_at: body.updated_at || new Date().toISOString() }; watches.set(watchKey(watch),watch); } delayWatchMs = Math.max(0, Math.min(5000, Number(body.delayWatchMs) || 0)); if (body.clearWrites) writes = []; return json(res, state()); }
    if (path.startsWith('/api/')) {
      const method = path === '/api/watch-progress' ? 'PUT' : path === '/api/profiles/select' || ['/api/auth/login','/api/auth/register'].includes(path) ? 'POST' : 'GET';
      const progressTarget = body.media_type === 'movie' && ['qa-film','qa-film-b'].includes(body.media_id) && body.video_id == null || body.media_type === 'series' && body.media_id === 'qa-show' && episodes.some(episode=>episode.id===body.video_id);
      const progressValid = path !== '/api/watch-progress' || (progressTarget && Number.isFinite(body.position_seconds) && body.position_seconds >= 0 && body.position_seconds <= 121 && (body.duration_seconds === undefined || body.duration_seconds === null || Number.isFinite(body.duration_seconds)));
      if(req.method !== method || !progressValid){unexpected.push({path,method:req.method,reason:'Fixture contract mismatch'});return json(res,{error:'Fixture contract mismatch'},400);}
    }
    if (!path.startsWith('/qa/')) {
      requests.push({path, method:req.method, at:Date.now()});
      rule = {...rules[path]};
      if (rule.hold) await new Promise(resolve => held.set(path, [...(held.get(path) || []), resolve]));
      if (rule.status) return json(res, {error:'Synthetic failure'}, rule.status);
    }
    if (path === '/qa/bootstrap') {
      const tracks = url.searchParams.get('tracks') === '1';
      const fixture = tracks ? '/multitrack.webm?token=synthetic-only&source=1' : '/fixture.webm';
      const captions = tracks ? [{ id: 'qa-en', lang: 'eng', url: '/english.srt' }, { id: 'qa-fr', lang: 'fra', url: '/french.srt' }, { id: 'qa-en-alt', lang: 'eng', url: '/english-alternate.srt' }] : [{ id: 'qa-en', lang: 'eng', url: '/fixture.srt' }];
      const sessionScript = (key, source) => `sessionStorage.setItem('wadi.playback.qa-profile.${key}',JSON.stringify({stream:{addon_id:'qa-addon',url:location.origin+${JSON.stringify(source)},subtitles:${JSON.stringify(captions)}.map(track=>({...track,url:location.origin+track.url}))},target:{mediaType:'movie',mediaId:'qa-film',videoId:null}}));`;
      const destination = url.searchParams.get('settings') === '1' ? '/settings' : url.searchParams.get('detail') === '1' ? '/media/movie/qa-film' : '/media/movie/qa-film?playback=qa-session';
      const script = `localStorage.clear();sessionStorage.clear();localStorage.setItem('wadi.auth.token','synthetic-qa-only');localStorage.setItem('wadi.auth.profile_id','qa-profile');sessionStorage.setItem('wadi.profile.selected_token','synthetic-qa-only');localStorage.setItem('wadi.device.auto-playback.v1',JSON.stringify({state:{settings:{enabled:${url.searchParams.get('auto') === '1'},skipSelection:true}},version:0}));localStorage.setItem('wadi.device',JSON.stringify({state:{tvMode:${url.searchParams.get('tv') === '1'},askForProfile:false,theme:'dark',conversionEnabled:true},version:0}));${sessionScript('qa-session', fixture)}${sessionScript('qa-session-b', '/multitrack.webm?token=synthetic-only&source=2')}${url.searchParams.get('legacy') === '1' ? `localStorage.setItem('wadi.device.player.v1',${JSON.stringify(JSON.stringify({ ...defaults, subtitle_size: 0.9, subtitle_outline_width: undefined }))});` : ''}location.replace(${JSON.stringify(destination)});`;
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
    if (path.startsWith('/api/watch-data/') && metadata[path.slice('/api/watch-data/'.length)]) {
      const [media_type,media_id]=path.slice('/api/watch-data/'.length).split('/');
      if(delayWatchMs)await new Promise(resolve=>setTimeout(resolve,delayWatchMs));
      return json(res,{media_type,media_id,items:[...watches.values()].filter(item=>item.media_type===media_type&&item.media_id===media_id)});
    }
    if (path === '/api/watch-progress') {
      const value={...body,watched:body.watched??false,updated_at:new Date().toISOString()};watches.set(watchKey(value),value);
      if(body.media_type==='movie'&&body.media_id==='qa-film')watch=value;
      writes.push({media_type:body.media_type,media_id:body.media_id,video_id:body.video_id??null,position:body.position_seconds,updated_at:value.updated_at});return json(res,value);
    }
    if (path.startsWith('/api/meta/') && metadata[path.slice('/api/meta/'.length)]) return json(res,{responses:[{addon_id:'qa-addon',response:{meta:metadata[path.slice('/api/meta/'.length)]}}]});
    if (path === '/api/episodes/series/qa-show') return json(res,{media_type:'series',media_id:'qa-show',stale:false,items:episodes,sources:[{addonId:'qa-addon',fetchedAt:new Date().toISOString(),stale:false}]});
    if (path === '/api/episode-library') return json(res,{items:[],truncated:false});
    if (path === '/api/continue-watching') return json(res,{items:[...watches.values()].filter(item=>item.position_seconds>0&&!item.watched)});
    if (path.startsWith('/api/subtitles/') && streamTargets[path.slice('/api/subtitles/'.length)]) return json(res,{responses:[]});
    if (path.startsWith('/api/streams/') && streamTargets[path.slice('/api/streams/'.length)]) return json(res,{responses:[{addon_id:'qa-addon',response:{streams:rule.empty?[]:rule.unavailable?[{name:'Unavailable synthetic stream',url:''}]:streamTargets[path.slice('/api/streams/'.length)].map(source=>({name:`QA ${source}`,url:`http://127.0.0.1:${port}/multitrack.webm?token=synthetic-only&source=${source}`,subtitles:[['qa-en','eng','english.srt'],['qa-fr','fra','french.srt'],['qa-en-alt','eng','english-alternate.srt']].map(([id,lang,file])=>({id,lang,url:`http://127.0.0.1:${port}/${file}`}))}))}}]});
    if (['/api/addons','/api/catalogs','/api/lists'].includes(path) && req.method === 'GET') return json(res, {items:[]});
    if (path.startsWith('/api/')) { unexpected.push({path,method:req.method}); return json(res, {error:`Unexpected fixture API: ${req.method} ${path}`}, 501); }
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
server.on('listening', () => { port = server.address().port; });
return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4173);
  const server = createFixtureServer();
  server.listen(port, '127.0.0.1', () => console.log(`Synthetic Wadi QA: http://127.0.0.1:${server.address().port}/qa/bootstrap`));
}
