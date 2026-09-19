import { emailVerification } from './email-verification.js';
import { fetchAddonJson } from './addon-fetch.js';
import { createDatabase } from './database.js';
import { addDesktopAuth } from './desktop-auth.js';
import { addAccountRoutes } from './account.js';
import express from 'express';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
const identity = z.string().trim().min(1).max(512);
const addonSource = z.string().trim().min(1).max(16384, 'Addon URL must be 16,384 characters or fewer');
const credentials = z.object({ email: z.email().transform(v => v.toLowerCase()), password: z.string().min(8).max(1024) });
const profileInput = z.object({ name: z.string().trim().min(1).max(40), avatar_key: z.string().trim().max(2048).refine(value => /^avatar-[1-6]$/.test(value) || (() => { try {
        const url = new URL(value);
        return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    }
    catch {
        return false;
    } })(), 'Choose an avatar or enter an HTTP image URL').default('avatar-1'), theme_color: z.string().nullable().optional() });
const listInput = z.object({ name: z.string().trim().min(1).max(100), description: z.string().nullable().optional() });
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const now = () => new Date().toISOString();
export function createApp({ database = process.env.DATABASE_URL, sessionDays = 30, allowPrivateAddons = false, sendVerificationEmail } = {}) {
    const db = createDatabase(database);
    const { get, all, run } = db;
    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => {
        res.set('Cache-Control', 'private, no-store');
        if (req.headers.origin === 'wadi://app')
            res.set('Access-Control-Allow-Origin', 'wadi://app');
        res.set('Vary', 'Origin');
        res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Range');
        res.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
        res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Content-Type');
        if (req.method === 'OPTIONS')
            return res.sendStatus(204);
        next();
    });
    app.use(express.json({ limit: '1mb' }));
    app.get(['/health', '/api/health'], (_req, res) => res.json({ ok: true }));
    const ensureList = async (user, profile) => {
        if (!(await get('SELECT id FROM lists WHERE user_id=? AND profile_id=? AND lower(name)=?', user, profile, 'saved')))
            (await run('INSERT INTO lists(id,user_id,profile_id,name) VALUES(?,?,?,?) ON CONFLICT DO NOTHING', randomUUID(), user, profile, 'Saved'));
    };
    const session = async (user, res, status = 200) => {
        let profile = (await get('SELECT * FROM profiles WHERE user_id=? ORDER BY created_at LIMIT 1', user.id));
        if (!profile) {
            const id = randomUUID();
            (await run('INSERT INTO profiles(id,user_id,name) VALUES(?,?,?) ON CONFLICT(user_id,name) DO NOTHING', id, user.id, 'Main'));
            profile = (await get('SELECT * FROM profiles WHERE user_id=? AND name=?', user.id, 'Main'));
        }
        (await ensureList(user.id, profile.id));
        const token = randomBytes(32).toString('base64url');
        (await run('INSERT INTO sessions(id,user_id,profile_id,token_hash,expires_at) VALUES(?,?,?,?,?)', randomUUID(), user.id, profile.id, digest(token), new Date(Date.now() + sessionDays * 86400000).toISOString()));
        res.status(status).json({ token, user: { id: user.id, email: user.email, created_at: user.created_at }, active_profile_id: profile.id });
    };
    addDesktopAuth(app, { db, sessionDays });
    const verification = emailVerification({ app, db, session, sendEmail: sendVerificationEmail });
    app.post('/api/auth/register', async (req, res) => {
        const body = credentials.parse(req.body);
        if ((await get('SELECT id FROM users WHERE email=?', body.email)))
            fail(409, 'Email is already registered');
        res.status(202).json(await verification.begin(req, { email: body.email, passwordHash: await hash(body.password) }));
    });
    app.post('/api/auth/login', async (req, res) => {
        const body = credentials.parse(req.body);
        const user = (await get('SELECT * FROM users WHERE email=?', body.email));
        if (!user || !await verify(user.password_hash, body.password))
            fail(401, 'Invalid email or password');
        if (!user.email_verified_at) return res.status(202).json(await verification.begin(req, { email: user.email, passwordHash: user.password_hash, userId: user.id }));
        (await session(user, res));
    });
    app.use('/api', async (req, _res, next) => {
        const token = req.headers.authorization?.replace(/^Bearer /, '');
        if (!token)
            return next(Object.assign(new Error('Sign in to continue'), { status: 401 }));
        const user = (await get('SELECT users.id,users.email,sessions.profile_id FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>? AND users.email_verified_at IS NOT NULL', digest(token), now()));
        if (!user)
            return next(Object.assign(new Error('Session expired'), { status: 401 }));
        req.user = user;
        req.tokenHash = digest(token);
        next();
    });
    addAccountRoutes(app, db);
    app.get('/api/server-capabilities', (_req, res) => res.json({ conversion: false }));
    app.get('/api/auth/me', async (req, res) => {
        // Renew active sessions near expiry without writing on every request.
        await run('UPDATE sessions SET expires_at=? WHERE token_hash=? AND expires_at<?', new Date(Date.now() + sessionDays * 86400000).toISOString(), req.tokenHash, new Date(Date.now() + sessionDays * 86400000 / 2).toISOString());
        res.json({ id: req.user.id, email: req.user.email, active_profile_id: req.user.profile_id });
    });
    app.post('/api/auth/logout', async (req, res) => { (await run('DELETE FROM sessions WHERE token_hash=?', req.tokenHash)); res.sendStatus(204); });
    const ownProfile = async (req, id) => (await get('SELECT * FROM profiles WHERE id=? AND user_id=?', id, req.user.id)) ?? fail(404, 'Profile not found');
    app.get('/api/profiles', async (req, res) => res.json({ items: (await all('SELECT * FROM profiles WHERE user_id=? ORDER BY created_at', req.user.id)) }));
    app.post('/api/profiles', async (req, res) => {
        const b = profileInput.parse(req.body);
        if ((await get('SELECT count(*) AS count FROM profiles WHERE user_id=?', req.user.id)).count >= 5)
            fail(400, 'Profile limit reached');
        const id = randomUUID();
        (await run('INSERT INTO profiles(id,user_id,name,avatar_key,theme_color) VALUES(?,?,?,?,?)', id, req.user.id, b.name, b.avatar_key, b.theme_color ?? null));
        (await ensureList(req.user.id, id));
        res.status(201).json((await ownProfile(req, id)));
    });
    app.post('/api/profiles/select', async (req, res) => {
        const id = identity.parse(req.body.profile_id);
        (await ownProfile(req, id));
        (await run('UPDATE sessions SET profile_id=? WHERE token_hash=?', id, req.tokenHash));
        res.json({ active_profile_id: id });
    });
    app.put('/api/profiles/:id', async (req, res) => {
        (await ownProfile(req, req.params.id));
        const b = profileInput.parse(req.body);
        (await run("UPDATE profiles SET name=?,avatar_key=?,theme_color=?,updated_at=wadi_now() WHERE id=?", b.name, b.avatar_key, b.theme_color ?? null, req.params.id));
        res.json((await ownProfile(req, req.params.id)));
    });
    app.delete('/api/profiles/:id', async (req, res) => {
        (await ownProfile(req, req.params.id));
        const replacement = (await get('SELECT id FROM profiles WHERE user_id=? AND id<>? LIMIT 1', req.user.id, req.params.id));
        if (!replacement)
            fail(400, 'Cannot delete the last profile');
        (await run('UPDATE sessions SET profile_id=? WHERE user_id=? AND profile_id=?', replacement.id, req.user.id, req.params.id));
        (await run('DELETE FROM profiles WHERE id=?', req.params.id));
        res.sendStatus(204);
    });
    const listView = row => ({ ...row, is_default: row.name.toLowerCase() === 'saved' });
    const ownList = async (req, id) => (await get('SELECT id,name,description,created_at,updated_at FROM lists WHERE id=? AND user_id=? AND profile_id=?', id, req.user.id, req.user.profile_id)) ?? fail(404, 'List not found');
    app.get('/api/lists', async (req, res) => { (await ensureList(req.user.id, req.user.profile_id)); res.json({ items: (await all('SELECT id,name,description,created_at,updated_at FROM lists WHERE user_id=? AND profile_id=? ORDER BY updated_at DESC', req.user.id, req.user.profile_id)).map(listView) }); });
    app.post('/api/lists', async (req, res) => {
        const b = listInput.parse(req.body), id = randomUUID();
        (await run('INSERT INTO lists(id,user_id,profile_id,name,description) VALUES(?,?,?,?,?)', id, req.user.id, req.user.profile_id, b.name, b.description ?? null));
        res.status(201).json(listView((await ownList(req, id))));
    });
    for (const method of ['put', 'delete'])
        app[method]('/api/lists/:id', async (req, res) => {
            const list = (await ownList(req, req.params.id));
            if (listView(list).is_default)
                fail(400, 'The Saved list cannot be changed');
            if (method === 'delete') {
                (await run('DELETE FROM lists WHERE id=?', list.id));
                return res.sendStatus(204);
            }
            const b = listInput.parse(req.body);
            (await run("UPDATE lists SET name=?,description=?,updated_at=wadi_now() WHERE id=?", b.name, b.description ?? null, list.id));
            res.json(listView((await ownList(req, list.id))));
        });
    const itemView = ({ meta_json, user_id, profile_id, ...row }) => ({ ...row, meta: meta_json ? JSON.parse(meta_json) : null });
    app.get('/api/lists/:id/items', async (req, res) => { (await ownList(req, req.params.id)); res.json({ items: (await all('SELECT * FROM list_items WHERE list_id=? ORDER BY created_at DESC', req.params.id)).map(itemView) }); });
    app.post('/api/lists/:id/items', async (req, res) => {
        (await ownList(req, req.params.id));
        const b = z.object({ media_type: identity, media_id: identity, title: identity, video_id: identity.nullable().optional(), addon_id: z.string().nullable().optional(), poster: z.string().nullable().optional(), release_info: z.string().nullable().optional(), meta: z.unknown().optional() }).parse(req.body);
        const existing = (await get("SELECT id FROM list_items WHERE list_id=? AND media_type=? AND media_id=? AND COALESCE(video_id,'')=?", req.params.id, b.media_type, b.media_id, b.video_id ?? ''));
        const id = existing?.id ?? randomUUID();
        if (!existing)
            (await run('INSERT INTO list_items(id,list_id,user_id,profile_id,addon_id,media_type,media_id,video_id,title,poster,release_info,meta_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', id, req.params.id, req.user.id, req.user.profile_id, b.addon_id ?? null, b.media_type, b.media_id, b.video_id ?? null, b.title, b.poster ?? null, b.release_info ?? null, b.meta ? JSON.stringify(b.meta) : null));
        res.status(201).json(itemView((await get('SELECT * FROM list_items WHERE id=?', id))));
    });
    app.delete('/api/lists/:id/items/:item', async (req, res) => { (await ownList(req, req.params.id)); (await run('DELETE FROM list_items WHERE id=? AND list_id=?', req.params.item, req.params.id)); res.sendStatus(204); });
    const watchView = row => {
        const { media_type, media_id, video_id, watched, position_seconds, duration_seconds, updated_at } = row;
        return { media_type, media_id, video_id, watched: Boolean(watched), position_seconds, duration_seconds, updated_at };
    };
    const watch = async (req, type, id, video) => (await get("SELECT * FROM watch_states WHERE user_id=? AND profile_id=? AND media_type=? AND media_id=? AND COALESCE(video_id,'')=?", req.user.id, req.user.profile_id, type, id, video ?? '')) ?? { media_type: type, media_id: id, video_id: video ?? null, watched: false, position_seconds: 0, duration_seconds: null, updated_at: null };
    app.get('/api/watch-state/:type/:id', async (req, res) => res.json(watchView((await watch(req, req.params.type, req.params.id, req.query.video_id)))));
    app.get('/api/watch-data/:type/:id', async (req, res) => res.json({ media_type: req.params.type, media_id: req.params.id, items: (await all('SELECT * FROM watch_states WHERE user_id=? AND profile_id=? AND media_type=? AND media_id=?', req.user.id, req.user.profile_id, req.params.type, req.params.id)).map(watchView) }));
    for (const route of ['watch-state', 'watch-progress'])
        app.put(`/api/${route}`, async (req, res) => {
            const common = z.object({ media_type: identity, media_id: identity, video_id: identity.nullable().optional() });
            const b = (route === 'watch-state' ? common.extend({ watched: z.boolean() }) : common.extend({ position_seconds: z.number().int().nonnegative(), duration_seconds: z.number().int().positive().nullable().optional() })).parse(req.body);
            const previous = (await watch(req, b.media_type, b.media_id, b.video_id));
            const position = b.position_seconds ?? previous.position_seconds, duration = b.duration_seconds ?? previous.duration_seconds;
            const watched = b.watched ?? (duration && position >= duration ? true : previous.watched);
            if (!previous.id)
                (await run('INSERT INTO watch_states(id,user_id,profile_id,media_type,media_id,video_id) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING', randomUUID(), req.user.id, req.user.profile_id, b.media_type, b.media_id, b.video_id ?? null));
            (await run("UPDATE watch_states SET watched=?,position_seconds=?,duration_seconds=?,updated_at=? WHERE user_id=? AND profile_id=? AND media_type=? AND media_id=? AND COALESCE(video_id,'')=?", Number(watched), position, duration, now(), req.user.id, req.user.profile_id, b.media_type, b.media_id, b.video_id ?? ''));
            res.json(watchView((await watch(req, b.media_type, b.media_id, b.video_id))));
        });
    app.get('/api/continue-watching', async (req, res) => res.json({ items: (await all('SELECT * FROM watch_states WHERE user_id=? AND profile_id=? AND watched=0 AND position_seconds>0 ORDER BY updated_at DESC LIMIT ?', req.user.id, req.user.profile_id, Math.max(1, Math.min(100, Math.floor(Number(req.query.limit)) || 20)))).map(watchView) }));
    const emptyPage = () => ({ order: [], hidden: [] });
    const defaults = { subtitles_enabled: true, subtitle_language: null, subtitle_delay_seconds: 0, subtitle_size: 1, subtitle_position: 0, subtitle_text_color: '#FFFFFF', subtitle_background_color: '#000000', subtitle_background_opacity: 0, subtitle_outline_color: '#000000', subtitle_outline_style: 'outline', subtitle_font_family: 'sans-serif', subtitle_offset_x: 0, subtitle_offset_y: 0, playback_speed: 1, preferred_audio_language: null, preferred_audio_track_id: null };
    for (const [route, column, fallback, schema] of [
        ['browse-layout', 'browse_layout_json', { pages: { home: emptyPage() } }, z.object({ hero: z.object({ hidden: z.boolean(), source: z.string().max(512), rotate: z.boolean() }).optional(), pages: z.object(Object.fromEntries(['home'].map(key => [key, z.object({ order: z.array(identity).default([]), hidden: z.array(identity).default([]), catalogModes: z.record(z.string(), z.enum(["combined", "movie", "series"])).optional() }).default(emptyPage())]))).default({}) })],
        ['playback', 'playback_prefs_json', { stream_action: 'internal', external_player_preset: 'vlc', external_player_template: 'vlc://{url}' }, z.object({ stream_action: z.enum(['internal', 'copy', 'external']), external_player_preset: z.enum(['choose','vlc','mpv','iina','mxplayer','justplayer','outplayer','moonplayer','cineultra','infuse','vidhub','m3u','custom']).optional(), external_player_template: z.string().refine(v => /^[a-z][a-z\d+.-]*:/i.test(v) && v.includes('{url}') && !/^(javascript|data|vbscript|file|shell|powershell|cmd|ms-settings):/i.test(v)) })],
    ]) {
        app.get(`/api/settings/${route}`, async (req, res) => {
            const row = (await get(`SELECT ${column} AS value FROM user_settings WHERE user_id=? AND profile_id=?`, req.user.id, req.user.profile_id));
            const saved = row ? JSON.parse(row.value) : {};
            res.json(route === 'browse-layout' ? schema.parse(Object.keys(saved).length ? saved : fallback) : Object.keys(saved).length ? saved : fallback);
        });
        app.put(`/api/settings/${route}`, async (req, res) => {
            const value = schema.parse(req.body);
            (await run(`INSERT INTO user_settings(user_id,profile_id,${column}) VALUES(?,?,?) ON CONFLICT(user_id,profile_id) DO UPDATE SET ${column}=excluded.${column},updated_at=wadi_now()`, req.user.id, req.user.profile_id, JSON.stringify(value)));
            res.json(value);
        });
    }
    const prefsSchema = z.object(Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, (value === null ? z.string().nullable() : typeof value === 'number' ? z.number().finite() : typeof value === 'boolean' ? z.boolean() : z.string().max(100)).optional()])));
    for (const route of ['/api/settings/player-defaults', '/api/settings/player-override/:type/:id']) {
        app.get(route, async (req, res) => {
            const row = (await get('SELECT value FROM player_settings WHERE profile_id=? AND media_type=? AND media_id=?', req.user.profile_id, req.params.type ?? '', req.params.id ?? ''));
            res.json({ ...(req.params.id ? {} : defaults), ...(row ? JSON.parse(row.value) : {}) });
        });
        app.put(route, async (req, res) => {
            const value = prefsSchema.parse(req.body);
            if (value.playback_speed !== undefined && (value.playback_speed < 0.25 || value.playback_speed > 4))
                fail(400, 'Playback speed must be between 0.25 and 4');
            const prior = (await get('SELECT value FROM player_settings WHERE profile_id=? AND media_type=? AND media_id=?', req.user.profile_id, req.params.type ?? '', req.params.id ?? ''));
            const merged = { ...(prior ? JSON.parse(prior.value) : {}), ...value };
            (await run('INSERT INTO player_settings(profile_id,media_type,media_id,value) VALUES(?,?,?,?) ON CONFLICT(profile_id,media_type,media_id) DO UPDATE SET value=excluded.value', req.user.profile_id, req.params.type ?? '', req.params.id ?? '', JSON.stringify(merged)));
            res.json({ ...(req.params.id ? {} : defaults), ...merged });
        });
    }
    const httpUrl = input => {
        let url;
        try {
            url = new URL(input);
        }
        catch {
            fail(400, 'Invalid URL');
        }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
            fail(400, 'Use an HTTP or HTTPS URL without credentials');
        return url;
    };
    const manifestUrl = source => {
        let url;
        if (/^ip[fn]s:\/\//.test(source)) {
            const parsed = new URL(source);
            url = httpUrl(`${process.env.IPFS_GATEWAY ?? 'https://ipfs.io'}/${parsed.protocol.slice(0, -1)}/${parsed.host}${parsed.pathname}`);
        }
        else
            url = httpUrl(source.replace(/^stremio:/, 'https:'));
        url.pathname = url.pathname.replace(/\/$/, '').replace(/\/manifest.json$/, '') + '/manifest.json';
        return url;
    };
    const fetchJson = url => fetchAddonJson(url, { allowPrivate: allowPrivateAddons });
    const manifestSchema = z.object({ id: identity, name: identity, version: identity, resources: z.array(z.union([identity, z.object({ name: identity, types: z.array(identity).default([]), idPrefixes: z.array(identity).default([]) }).passthrough()])).min(1), types: z.array(identity).default([]), idPrefixes: z.array(identity).default([]), catalogs: z.array(z.object({ id: identity, type: identity }).passthrough()).default([]) }).passthrough();
    const addonView = ({ manifest_json, config_json, user_id, ...row }) => ({ ...row, manifest: manifestSchema.parse(JSON.parse(manifest_json)), config: config_json ? JSON.parse(config_json) : null });
    const userAddons = async (req) => (await all('SELECT * FROM addons WHERE user_id=? ORDER BY sort_order, installed_at, id', req.user.id)).map(addonView);
    const ownAddon = async (req, id) => addonView((await get('SELECT * FROM addons WHERE id=? AND user_id=?', id, req.user.id)) ?? fail(404, 'Addon not found'));
    app.get('/api/addons', async (req, res) => res.json({ items: (await userAddons(req)) }));
    app.put('/api/addons/order', async (req, res) => {
        const ids = z.object({ ids: z.array(identity).max(200) }).parse(req.body).ids;
        const owned = (await all('SELECT id FROM addons WHERE user_id=?', req.user.id)).map(addon => addon.id);
        if (ids.length !== owned.length || new Set(ids).size !== ids.length || ids.some(id => !owned.includes(id)))
            fail(400, 'Order must contain each installed addon exactly once');
        await db.transaction(async (tx) => {
            for (const [position, id] of ids.entries())
                await tx.run('UPDATE addons SET sort_order=? WHERE id=? AND user_id=?', position, id, req.user.id);
        });
        res.json({ items: (await userAddons(req)) });
    });
    for (const action of ['preview', 'install'])
        app.post(`/api/addons/${action}`, async (req, res) => {
            const source = addonSource.parse(req.body.url), url = manifestUrl(source);
            const manifest = manifestSchema.parse(await fetchJson(url));
            const existing = (await get('SELECT id FROM addons WHERE user_id=? AND source_url=?', req.user.id, source));
            const transport = /^ip[fn]s:/.test(source) ? 'ipfs' : /\/stremio\/v1\/?$/.test(source) ? 'legacy' : 'http';
            if (action === 'preview')
                return res.json({ source_url: source, transport, manifest, favicon_url: manifest.logo ?? new URL('/favicon.ico', url).href, installed_addon_id: existing?.id ?? null });
            const id = existing?.id ?? randomUUID();
            (await run("INSERT INTO addons(id,user_id,source_url,transport,manifest_json,sort_order) VALUES(?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM addons)) ON CONFLICT(user_id,source_url) DO UPDATE SET manifest_json=excluded.manifest_json,transport=excluded.transport,updated_at=wadi_now()", id, req.user.id, source, transport, JSON.stringify(manifest)));
            res.status(201).json((await ownAddon(req, id)));
        });
    app.get('/api/addons/:id', async (req, res) => res.json((await ownAddon(req, req.params.id))));
    app.delete('/api/addons/:id', async (req, res) => { (await ownAddon(req, req.params.id)); (await run('DELETE FROM addons WHERE id=?', req.params.id)); res.sendStatus(204); });
    app.post('/api/addons/:id/configure', async (req, res) => { (await ownAddon(req, req.params.id)); (await run("UPDATE addons SET config_json=?,updated_at=wadi_now() WHERE id=?", JSON.stringify(req.body), req.params.id)); res.json((await ownAddon(req, req.params.id))); });
    app.get('/api/catalogs', async (req, res) => res.json({ items: (await userAddons(req)).flatMap(a => a.manifest.catalogs.map(catalog => ({ addon_id: a.id, addon_name: a.manifest.name, catalog }))) }));
    for (const [route, kind] of [['catalog', 'catalog'], ['meta', 'meta'], ['streams', 'stream'], ['subtitles', 'subtitles']])
        app.get(`/api/${route}/:type/:id`, async (req, res) => {
            const { type, id } = req.params;
            const addons = (await userAddons(req)).filter(a => kind !== 'catalog' || !req.query.addon_id || a.id === req.query.addon_id).filter(a => kind === 'catalog' ? a.manifest.catalogs.some(c => c.id === id && c.type === type) : a.manifest.resources.some(r => {
                const name = typeof r === 'string' ? r : r.name;
                const types = typeof r === 'string' ? a.manifest.types : r.types;
                const prefixes = typeof r === 'string' ? a.manifest.idPrefixes : r.idPrefixes;
                return name === kind && types.includes(type) && (!prefixes.length || prefixes.some(prefix => id.startsWith(prefix)));
            }));
            const results = await Promise.allSettled(addons.map(async (a) => {
                const url = manifestUrl(a.source_url);
                const extras = new URLSearchParams(Object.entries(req.query).filter(([key, value]) => key !== 'addon_id' && typeof value === 'string').sort(([a], [b]) => a.localeCompare(b)));
                const suffix = extras.size && a.transport !== 'legacy' ? `/${extras}` : '';
                url.pathname = url.pathname.replace(/\/manifest.json$/, '') + `/${kind}/${encodeURIComponent(type)}/${encodeURIComponent(id)}${suffix}.json`;
                if (a.transport === 'legacy')
                    extras.forEach((value, key) => url.searchParams.set(key, value));
                if (a.config)
                    url.searchParams.set('config', JSON.stringify(a.config));
                return { addon_id: a.id, response: await fetchJson(url) };
            }));
            if (Buffer.byteLength(JSON.stringify(results)) > 4 * 1024 * 1024) fail(502, 'Combined addon response is too large. Reduce installed addons or narrow the query.');
            res.json({ responses: results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []), errors: results.flatMap((r, i) => r.status === 'rejected' ? [{ addon_id: addons[i].id, error: r.reason.message }] : []) });
        });
    app.use((err, _req, res, _next) => {
        if (res.headersSent)
            return res.destroy(err);
        const status = err instanceof z.ZodError ? 400 : err.status ?? ((err.code === '23505' || err.code?.includes('CONSTRAINT') || [19, 1555, 2067].includes(err.errcode)) ? 409 : 500);
        res.status(status).json({ error: status === 500 ? 'Server error' : err.message, ...(err.code === 'ADDON_PROVIDER_ERROR' ? { code: err.code } : {}) });
    });
    return { app, db };
}
