import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';

const identity = z.string().trim().min(1).max(512);
const credentials = z.object({ email: z.email().transform(v => v.toLowerCase()), password: z.string().min(8).max(1024) });
const profileInput = z.object({ name: z.string().trim().min(1).max(40), avatar_key: z.string().trim().max(2048).refine(value => /^avatar-[1-6]$/.test(value) || (() => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; } })(), 'Choose an avatar or enter an HTTP image URL').default('avatar-1'), theme_color: z.string().nullable().optional() });
const listInput = z.object({ name: z.string().trim().min(1).max(100), description: z.string().nullable().optional() });
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const now = () => new Date().toISOString();

export function createApp({ database = ':memory:', sessionDays = 30 } = {}) {
  const db = new DatabaseSync(database);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(readFileSync(resolve(process.cwd(), 'server/schema.sql'), 'utf8'));
  db.exec(`CREATE TABLE IF NOT EXISTS player_settings (profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, media_type TEXT NOT NULL DEFAULT '', media_id TEXT NOT NULL DEFAULT '', value TEXT NOT NULL, PRIMARY KEY(profile_id, media_type, media_id));`);
  if (!db.prepare('PRAGMA table_info(addons)').all().some(column => column.name === 'sort_order')) db.exec('ALTER TABLE addons ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Range');
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.get(['/health', '/api/health'], (_req, res) => res.json({ ok: true }));
  const ensureList = (user, profile) => {
    if (!get('SELECT id FROM lists WHERE user_id=? AND profile_id=? AND lower(name)=?', user, profile, 'saved')) run('INSERT INTO lists(id,user_id,profile_id,name) VALUES(?,?,?,?)', randomUUID(), user, profile, 'Saved');
  };
  const session = (user, res, status = 200) => {
    let profile = get('SELECT * FROM profiles WHERE user_id=? ORDER BY created_at LIMIT 1', user.id);
    if (!profile) {
      const id = randomUUID();
      run('INSERT INTO profiles(id,user_id,name) VALUES(?,?,?)', id, user.id, 'Main');
      profile = get('SELECT * FROM profiles WHERE id=?', id);
    }
    ensureList(user.id, profile.id);
    const token = randomBytes(32).toString('base64url');
    run('INSERT INTO sessions(id,user_id,profile_id,token_hash,expires_at) VALUES(?,?,?,?,?)', randomUUID(), user.id, profile.id, digest(token), new Date(Date.now() + sessionDays * 86400000).toISOString());
    res.status(status).json({ token, user: { id: user.id, email: user.email, created_at: user.created_at }, active_profile_id: profile.id });
  };
  app.post('/api/auth/register', async (req, res) => {
    const body = credentials.parse(req.body);
    if (get('SELECT id FROM users WHERE email=?', body.email)) fail(409, 'Email is already registered');
    const password = await hash(body.password);
    const id = randomUUID();
    run('INSERT INTO users(id,email,password_hash) VALUES(?,?,?)', id, body.email, password);
    session(get('SELECT * FROM users WHERE id=?', id), res, 201);
  });
  app.post('/api/auth/login', async (req, res) => {
    const body = credentials.parse(req.body);
    const user = get('SELECT * FROM users WHERE email=?', body.email);
    if (!user || !await verify(user.password_hash, body.password)) fail(401, 'Invalid email or password');
    session(user, res);
  });
  app.use('/api', (req, _res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) return next(Object.assign(new Error('Sign in to continue'), { status: 401 }));
    const user = get('SELECT users.id,users.email,sessions.profile_id FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND julianday(expires_at)>julianday(?)', digest(token), now());
    if (!user) return next(Object.assign(new Error('Session expired'), { status: 401 }));
    req.user = user;
    req.tokenHash = digest(token);
    next();
  });
  app.get('/api/auth/me', (req, res) => res.json({ id: req.user.id, email: req.user.email, active_profile_id: req.user.profile_id }));
  app.post('/api/auth/logout', (req, res) => { run('DELETE FROM sessions WHERE token_hash=?', req.tokenHash); res.sendStatus(204); });
  const ownProfile = (req, id) => get('SELECT * FROM profiles WHERE id=? AND user_id=?', id, req.user.id) ?? fail(404, 'Profile not found');
  app.get('/api/profiles', (req, res) => res.json({ items: all('SELECT * FROM profiles WHERE user_id=? ORDER BY created_at', req.user.id) }));
  app.post('/api/profiles', (req, res) => {
    const b = profileInput.parse(req.body);
    if (get('SELECT count(*) AS count FROM profiles WHERE user_id=?', req.user.id).count >= 5) fail(400, 'Profile limit reached');
    const id = randomUUID();
    run('INSERT INTO profiles(id,user_id,name,avatar_key,theme_color) VALUES(?,?,?,?,?)', id, req.user.id, b.name, b.avatar_key, b.theme_color ?? null);
    ensureList(req.user.id, id);
    res.status(201).json(ownProfile(req, id));
  });
  app.post('/api/profiles/select', (req, res) => {
    const id = identity.parse(req.body.profile_id); ownProfile(req, id);
    run('UPDATE sessions SET profile_id=? WHERE token_hash=?', id, req.tokenHash);
    res.json({ active_profile_id: id });
  });
  app.put('/api/profiles/:id', (req, res) => {
    ownProfile(req, req.params.id); const b = profileInput.parse(req.body);
    run("UPDATE profiles SET name=?,avatar_key=?,theme_color=?,updated_at=datetime('now') WHERE id=?", b.name, b.avatar_key, b.theme_color ?? null, req.params.id);
    res.json(ownProfile(req, req.params.id));
  });
  app.delete('/api/profiles/:id', (req, res) => {
    ownProfile(req, req.params.id);
    const replacement = get('SELECT id FROM profiles WHERE user_id=? AND id<>? LIMIT 1', req.user.id, req.params.id);
    if (!replacement) fail(400, 'Cannot delete the last profile');
    run('UPDATE sessions SET profile_id=? WHERE user_id=? AND profile_id=?', replacement.id, req.user.id, req.params.id);
    run('DELETE FROM profiles WHERE id=?', req.params.id); res.sendStatus(204);
  });
  const listView = row => ({ ...row, is_default: row.name.toLowerCase() === 'saved' });
  const ownList = (req, id) => get('SELECT id,name,description,created_at,updated_at FROM lists WHERE id=? AND user_id=? AND profile_id=?', id, req.user.id, req.user.profile_id) ?? fail(404, 'List not found');
  app.get('/api/lists', (req, res) => { ensureList(req.user.id, req.user.profile_id); res.json({ items: all('SELECT id,name,description,created_at,updated_at FROM lists WHERE user_id=? AND profile_id=? ORDER BY updated_at DESC', req.user.id, req.user.profile_id).map(listView) }); });
  app.post('/api/lists', (req, res) => {
    const b = listInput.parse(req.body), id = randomUUID();
    run('INSERT INTO lists(id,user_id,profile_id,name,description) VALUES(?,?,?,?,?)', id, req.user.id, req.user.profile_id, b.name, b.description ?? null);
    res.status(201).json(listView(ownList(req, id)));
  });
  for (const method of ['put', 'delete']) app[method]('/api/lists/:id', (req, res) => {
    const list = ownList(req, req.params.id);
    if (listView(list).is_default) fail(400, 'The Saved list cannot be changed');
    if (method === 'delete') { run('DELETE FROM lists WHERE id=?', list.id); return res.sendStatus(204); }
    const b = listInput.parse(req.body);
    run("UPDATE lists SET name=?,description=?,updated_at=datetime('now') WHERE id=?", b.name, b.description ?? null, list.id);
    res.json(listView(ownList(req, list.id)));
  });
  const itemView = ({ meta_json, user_id, profile_id, ...row }) => ({ ...row, meta: meta_json ? JSON.parse(meta_json) : null });
  app.get('/api/lists/:id/items', (req, res) => { ownList(req, req.params.id); res.json({ items: all('SELECT * FROM list_items WHERE list_id=? ORDER BY created_at DESC', req.params.id).map(itemView) }); });
  app.post('/api/lists/:id/items', (req, res) => {
    ownList(req, req.params.id);
    const b = z.object({ media_type: identity, media_id: identity, title: identity, video_id: identity.nullable().optional(), addon_id: z.string().nullable().optional(), poster: z.string().nullable().optional(), release_info: z.string().nullable().optional(), meta: z.unknown().optional() }).parse(req.body);
    const existing = get("SELECT id FROM list_items WHERE list_id=? AND media_type=? AND media_id=? AND COALESCE(video_id,'')=?", req.params.id, b.media_type, b.media_id, b.video_id ?? '');
    const id = existing?.id ?? randomUUID();
    if (!existing) run('INSERT INTO list_items(id,list_id,user_id,profile_id,addon_id,media_type,media_id,video_id,title,poster,release_info,meta_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', id, req.params.id, req.user.id, req.user.profile_id, b.addon_id ?? null, b.media_type, b.media_id, b.video_id ?? null, b.title, b.poster ?? null, b.release_info ?? null, b.meta ? JSON.stringify(b.meta) : null);
    res.status(201).json(itemView(get('SELECT * FROM list_items WHERE id=?', id)));
  });
  app.delete('/api/lists/:id/items/:item', (req, res) => { ownList(req, req.params.id); run('DELETE FROM list_items WHERE id=? AND list_id=?', req.params.item, req.params.id); res.sendStatus(204); });
  const watchView = row => {
    const { media_type, media_id, video_id, watched, position_seconds, duration_seconds, updated_at } = row;
    return { media_type, media_id, video_id, watched: Boolean(watched), position_seconds, duration_seconds, updated_at };
  };
  const watch = (req, type, id, video) => get("SELECT * FROM watch_states WHERE user_id=? AND profile_id=? AND media_type=? AND media_id=? AND COALESCE(video_id,'')=?", req.user.id, req.user.profile_id, type, id, video ?? '') ?? { media_type: type, media_id: id, video_id: video ?? null, watched: false, position_seconds: 0, duration_seconds: null, updated_at: null };
  app.get('/api/watch-state/:type/:id', (req, res) => res.json(watchView(watch(req, req.params.type, req.params.id, req.query.video_id))));
  app.get('/api/watch-data/:type/:id', (req, res) => res.json({ media_type: req.params.type, media_id: req.params.id, items: all('SELECT * FROM watch_states WHERE user_id=? AND profile_id=? AND media_type=? AND media_id=?', req.user.id, req.user.profile_id, req.params.type, req.params.id).map(watchView) }));
  for (const route of ['watch-state', 'watch-progress']) app.put(`/api/${route}`, (req, res) => {
    const common = z.object({ media_type: identity, media_id: identity, video_id: identity.nullable().optional() });
    const b = (route === 'watch-state' ? common.extend({ watched: z.boolean() }) : common.extend({ position_seconds: z.number().int().nonnegative(), duration_seconds: z.number().int().positive().nullable().optional() })).parse(req.body);
    const previous = watch(req, b.media_type, b.media_id, b.video_id);
    const position = b.position_seconds ?? previous.position_seconds, duration = b.duration_seconds ?? previous.duration_seconds;
    const watched = b.watched ?? (duration && position >= duration ? true : previous.watched);
    if (!previous.id) run('INSERT INTO watch_states(id,user_id,profile_id,media_type,media_id,video_id) VALUES(?,?,?,?,?,?)', randomUUID(), req.user.id, req.user.profile_id, b.media_type, b.media_id, b.video_id ?? null);
    run("UPDATE watch_states SET watched=?,position_seconds=?,duration_seconds=?,updated_at=? WHERE user_id=? AND profile_id=? AND media_type=? AND media_id=? AND COALESCE(video_id,'')=?", Number(watched), position, duration, now(), req.user.id, req.user.profile_id, b.media_type, b.media_id, b.video_id ?? '');
    res.json(watchView(watch(req, b.media_type, b.media_id, b.video_id)));
  });
  app.get('/api/continue-watching', (req, res) => res.json({ items: all('SELECT * FROM watch_states WHERE user_id=? AND profile_id=? AND watched=0 AND position_seconds>0 ORDER BY updated_at DESC LIMIT ?', req.user.id, req.user.profile_id, Math.max(1, Math.min(100, Math.floor(Number(req.query.limit)) || 20))).map(watchView) }));
  const emptyPage = () => ({ order: [], hidden: [] });
  const defaults = { subtitles_enabled: true, subtitle_language: null, subtitle_delay_seconds: 0, subtitle_size: 1, subtitle_position: 0, subtitle_text_color: '#FFFFFF', subtitle_background_color: '#000000', subtitle_background_opacity: 0, subtitle_outline_color: '#000000', subtitle_outline_style: 'outline', subtitle_font_family: 'sans-serif', subtitle_offset_x: 0, subtitle_offset_y: 0, playback_speed: 1, preferred_audio_language: null, preferred_audio_track_id: null };
  for (const [route, column, fallback, schema] of [
    ['browse-layout', 'browse_layout_json', { pages: { home: emptyPage(), movies: emptyPage(), series: emptyPage() } }, z.object({ pages: z.object(Object.fromEntries(['home', 'movies', 'series'].map(key => [key, z.object({ order: z.array(identity).default([]), hidden: z.array(identity).default([]), catalogModes: z.record(z.string(), z.enum(["combined", "movie", "series"])).optional() }).default(emptyPage())]))).default({}) })],
    ['playback', 'playback_prefs_json', { stream_action: 'copy', external_player_template: 'vlc://{url}' }, z.object({ stream_action: z.enum(['copy', 'external']), external_player_template: z.string().refine(v => /^[a-z][a-z\d+.-]*:/i.test(v) && v.includes('{url}') && !/^(javascript|data|vbscript):/i.test(v)) })],
  ]) {
    app.get(`/api/settings/${route}`, (req, res) => {
      const row = get(`SELECT ${column} AS value FROM user_settings WHERE user_id=? AND profile_id=?`, req.user.id, req.user.profile_id);
      const saved = row ? JSON.parse(row.value) : {};
      res.json(Object.keys(saved).length ? saved : fallback);
    });
    app.put(`/api/settings/${route}`, (req, res) => {
      const value = schema.parse(req.body);
      run(`INSERT INTO user_settings(user_id,profile_id,${column}) VALUES(?,?,?) ON CONFLICT(user_id,profile_id) DO UPDATE SET ${column}=excluded.${column},updated_at=datetime('now')`, req.user.id, req.user.profile_id, JSON.stringify(value));
      res.json(value);
    });
  }
  const prefsSchema = z.object(Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, (value === null ? z.string().nullable() : typeof value === 'number' ? z.number().finite() : typeof value === 'boolean' ? z.boolean() : z.string().max(100)).optional()])));
  for (const route of ['/api/settings/player-defaults', '/api/settings/player-override/:type/:id']) {
    app.get(route, (req, res) => {
      const row = get('SELECT value FROM player_settings WHERE profile_id=? AND media_type=? AND media_id=?', req.user.profile_id, req.params.type ?? '', req.params.id ?? '');
      res.json({ ...(req.params.id ? {} : defaults), ...(row ? JSON.parse(row.value) : {}) });
    });
    app.put(route, (req, res) => {
      const value = prefsSchema.parse(req.body);
      if (value.playback_speed !== undefined && (value.playback_speed < 0.25 || value.playback_speed > 4)) fail(400, 'Playback speed must be between 0.25 and 4');
      const prior = get('SELECT value FROM player_settings WHERE profile_id=? AND media_type=? AND media_id=?', req.user.profile_id, req.params.type ?? '', req.params.id ?? '');
      const merged = { ...(prior ? JSON.parse(prior.value) : {}), ...value };
      run('INSERT INTO player_settings(profile_id,media_type,media_id,value) VALUES(?,?,?,?) ON CONFLICT(profile_id,media_type,media_id) DO UPDATE SET value=excluded.value', req.user.profile_id, req.params.type ?? '', req.params.id ?? '', JSON.stringify(merged));
      res.json({ ...(req.params.id ? {} : defaults), ...merged });
    });
  }
  const httpUrl = input => {
    let url;
    try { url = new URL(input); } catch { fail(400, 'Invalid URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail(400, 'Use an HTTP or HTTPS URL without credentials');
    return url;
  };
  const manifestUrl = source => {
    let url;
    if (/^ip[fn]s:\/\//.test(source)) {
      const parsed = new URL(source);
      url = httpUrl(`${process.env.IPFS_GATEWAY ?? 'https://ipfs.io'}/${parsed.protocol.slice(0, -1)}/${parsed.host}${parsed.pathname}`);
    } else url = httpUrl(source.replace(/^stremio:/, 'https:'));
    url.pathname = url.pathname.replace(/\/$/, '').replace(/\/manifest.json$/, '') + '/manifest.json';
    return url;
  };
  const fetchJson = async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'wadi-server/0.2' } });
    if (!response.ok) fail(502, `Addon returned HTTP ${response.status}`);
    const chunks = [];
    let size = 0;
    if (response.body) for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 8 * 1024 * 1024) fail(502, 'Addon response is too large');
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const manifestSchema = z.object({ id: identity, name: identity, version: identity, resources: z.array(z.union([identity, z.object({ name: identity, types: z.array(identity).default([]), idPrefixes: z.array(identity).default([]) }).passthrough()])).min(1), types: z.array(identity).default([]), idPrefixes: z.array(identity).default([]), catalogs: z.array(z.object({ id: identity, type: identity }).passthrough()).default([]) }).passthrough();
  const addonView = ({ manifest_json, config_json, user_id, ...row }) => ({ ...row, manifest: manifestSchema.parse(JSON.parse(manifest_json)), config: config_json ? JSON.parse(config_json) : null });
  const userAddons = req => all('SELECT * FROM addons WHERE user_id=? ORDER BY sort_order, installed_at, id', req.user.id).map(addonView);
  const ownAddon = (req, id) => addonView(get('SELECT * FROM addons WHERE id=? AND user_id=?', id, req.user.id) ?? fail(404, 'Addon not found'));
  app.get('/api/addons', (req, res) => res.json({ items: userAddons(req) }));
  app.put('/api/addons/order', (req, res) => {
    const ids = z.object({ ids: z.array(identity).max(200) }).parse(req.body).ids;
    const owned = all('SELECT id FROM addons WHERE user_id=?', req.user.id).map(addon => addon.id);
    if (ids.length !== owned.length || new Set(ids).size !== ids.length || ids.some(id => !owned.includes(id))) fail(400, 'Order must contain each installed addon exactly once');
    db.exec('BEGIN');
    try {
      ids.forEach((id, position) => run('UPDATE addons SET sort_order=? WHERE id=? AND user_id=?', position, id, req.user.id));
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.json({ items: userAddons(req) });
  });
  for (const action of ['preview', 'install']) app.post(`/api/addons/${action}`, async (req, res) => {
    const source = identity.parse(req.body.url), url = manifestUrl(source);
    const manifest = manifestSchema.parse(await fetchJson(url));
    const existing = get('SELECT id FROM addons WHERE user_id=? AND source_url=?', req.user.id, source);
    const transport = /^ip[fn]s:/.test(source) ? 'ipfs' : /\/stremio\/v1\/?$/.test(source) ? 'legacy' : 'http';
    if (action === 'preview') return res.json({ source_url: source, transport, manifest, favicon_url: manifest.logo ?? new URL('/favicon.ico', url).href, installed_addon_id: existing?.id ?? null });
    const id = existing?.id ?? randomUUID();
    run("INSERT INTO addons(id,user_id,source_url,transport,manifest_json,sort_order) VALUES(?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM addons)) ON CONFLICT(user_id,source_url) DO UPDATE SET manifest_json=excluded.manifest_json,transport=excluded.transport,updated_at=datetime('now')", id, req.user.id, source, transport, JSON.stringify(manifest));
    res.status(201).json(ownAddon(req, id));
  });
  app.get('/api/addons/:id', (req, res) => res.json(ownAddon(req, req.params.id)));
  app.delete('/api/addons/:id', (req, res) => { ownAddon(req, req.params.id); run('DELETE FROM addons WHERE id=?', req.params.id); res.sendStatus(204); });
  app.post('/api/addons/:id/configure', (req, res) => { ownAddon(req, req.params.id); run("UPDATE addons SET config_json=?,updated_at=datetime('now') WHERE id=?", JSON.stringify(req.body), req.params.id); res.json(ownAddon(req, req.params.id)); });
  app.get('/api/catalogs', (req, res) => res.json({ items: userAddons(req).flatMap(a => a.manifest.catalogs.map(catalog => ({ addon_id: a.id, addon_name: a.manifest.name, catalog }))) }));
  for (const [route, kind] of [['catalog', 'catalog'], ['meta', 'meta'], ['streams', 'stream'], ['subtitles', 'subtitles']]) app.get(`/api/${route}/:type/:id`, async (req, res) => {
    const { type, id } = req.params;
    const addons = userAddons(req).filter(a => kind === 'catalog' ? a.manifest.catalogs.some(c => c.id === id && c.type === type) : a.manifest.resources.some(r => {
      const name = typeof r === 'string' ? r : r.name;
      const types = typeof r === 'string' ? a.manifest.types : r.types;
      const prefixes = typeof r === 'string' ? a.manifest.idPrefixes : r.idPrefixes;
      return name === kind && types.includes(type) && (!prefixes.length || prefixes.some(prefix => id.startsWith(prefix)));
    }));
    const results = await Promise.allSettled(addons.map(async a => {
      const url = manifestUrl(a.source_url);
      const extras = new URLSearchParams(Object.entries(req.query).filter(([key, value]) => key !== 'addon_id' && typeof value === 'string').sort(([a], [b]) => a.localeCompare(b)));
      const suffix = extras.size && a.transport !== 'legacy' ? `/${extras}` : '';
      url.pathname = url.pathname.replace(/\/manifest.json$/, '') + `/${kind}/${encodeURIComponent(type)}/${encodeURIComponent(id)}${suffix}.json`;
      if (a.transport === 'legacy') extras.forEach((value, key) => url.searchParams.set(key, value));
      if (a.config) url.searchParams.set('config', JSON.stringify(a.config));
      return { addon_id: a.id, response: await fetchJson(url) };
    }));
    res.json({ responses: results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []), errors: results.flatMap((r, i) => r.status === 'rejected' ? [{ addon_id: addons[i].id, error: r.reason.message }] : []) });
  });
  for (const route of ['stream-proxy', 'subtitle-proxy']) app.get(`/api/${route}`, async (req, res) => {
    const url = httpUrl(z.string().parse(req.query.url));
    const controller = new AbortController();
    res.on('close', () => controller.abort());
    const headers = { 'Accept-Encoding': 'identity' };
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(url, { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(300000)]) });
    res.status(upstream.status);
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name); if (value) res.set(name, value);
    }
    if (!upstream.body || req.method === 'HEAD') return res.end();
    await pipeline(Readable.fromWeb(upstream.body), res);
  });
  app.use((err, _req, res, _next) => {
    if (res.headersSent) return res.destroy(err);
    const status = err instanceof z.ZodError ? 400 : err.status ?? ((err.code?.includes('CONSTRAINT') || [19, 1555, 2067].includes(err.errcode)) ? 409 : 500);
    res.status(status).json({ error: status === 500 ? 'Server error' : err.message });
  });
  return { app, db };
}
