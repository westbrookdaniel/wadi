// IntroDB reads are anonymous; never forward Wadi credentials or stream URLs.
const types = ['recap', 'intro', 'outro'];
export function parseSegments(body) {
    return types.flatMap(type => {
        const value = body?.[type];
        if (!value || !Number.isFinite(value.start_sec) || !Number.isFinite(value.end_sec)
            || value.start_sec < 0 || value.end_sec <= value.start_sec) return [];
        return [{ type, start: value.start_sec, end: value.end_sec }];
    }).sort((a, b) => a.start - b.start);
}

export function addIntroDbRoutes(app, { fetchImpl = fetch, now = Date.now } = {}) {
    const cache = new Map();
    const pending = new Map();
    app.get('/api/skip-segments', async (req, res) => {
        const { imdb_id, season, episode, is_movie } = req.query;
        const integer = value => typeof value === 'string' && /^\d{1,5}$/.test(value);
        if (typeof imdb_id !== 'string' || !/^tt\d{7,10}$/.test(imdb_id)
            || (is_movie !== undefined && is_movie !== 'true')
            || (is_movie === 'true' ? season !== undefined || episode !== undefined
                : !integer(season) || !integer(episode) || Number(episode) < 1)) {
            return res.status(400).json({ error: 'Provide an IMDb ID and valid episode numbers, or is_movie=true' });
        }
        const params = new URLSearchParams({ imdb_id, ...(is_movie === 'true'
            ? { is_movie: 'true' } : { season: String(Number(season)), episode: String(Number(episode)) }) });
        const key = params.toString();
        const cached = cache.get(key);
        if (cached && cached.expires > now()) return res.json({ items: cached.items });
        if (!pending.has(key)) {
            const request = (async () => {
                let items = [], ttl = 60_000;
                try {
                    const response = await fetchImpl(`https://api.introdb.app/segments?${key}`, {
                        signal: AbortSignal.timeout(5000), redirect: 'error',
                        headers: { Accept: 'application/json' },
                    });
                    if (response.ok) { items = parseSegments(await response.json()); ttl = 3_600_000; }
                    else if (response.status === 404) ttl = 3_600_000;
                } catch { /* Optional metadata must never interrupt playback. */ }
                cache.delete(key);
                if (cache.size >= 500) cache.delete(cache.keys().next().value);
                cache.set(key, { items, expires: now() + ttl });
                return items;
            })();
            pending.set(key, request);
            void request.finally(() => pending.delete(key));
        }
        res.json({ items: await pending.get(key) });
    });
}
