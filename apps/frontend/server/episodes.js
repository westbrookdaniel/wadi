import { z } from 'zod';
const text = value => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const integer = value => (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)) && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const dateSchema = z.iso.date();
const instantSchema = z.iso.datetime({ offset: true });
export function episodeRelease(value) {
  if (dateSchema.safeParse(value).success) return { released: value, releasePrecision: 'date' };
  if (instantSchema.safeParse(value).success) return { released: new Date(value).toISOString(), releasePrecision: 'instant' };
  return { releasePrecision: 'unknown' };
}
export function normalizeEpisodes(videos) {
  if (!Array.isArray(videos)) throw new Error('Provider did not return an episode list');
  return videos.flatMap(video => {
    if (!video || typeof video !== 'object' || !text(video.id)) return [];
    const season = integer(video.season), episode = integer(video.episode);
    return [{ id: text(video.id), title: text(video.title) ?? text(video.name) ?? (season !== null && episode !== null ? `S${season} E${episode}` : text(video.id)), season, episode,
      ...episodeRelease(video.released), overview: text(video.overview) ?? text(video.description), thumbnail: text(video.thumbnail) ?? text(video.poster) }];
  });
}
export function mergeEpisodeSources(sources, watchStates = [], now = Date.now()) {
  const byEpisode = new Map();
  for (const source of sources) for (const episode of source.episodes) {
    const key = episode.season !== null && episode.episode !== null ? `episode:${episode.season}:${episode.episode}` : `id:${episode.id}`;
    const previous = byEpisode.get(key);
    if (!previous) byEpisode.set(key, { ...episode, videoIds: [episode.id], addonIds: [source.addonId], releaseConflicting: false });
    else {
      if (!previous.videoIds.includes(episode.id)) previous.videoIds.push(episode.id);
      if (!previous.addonIds.includes(source.addonId)) previous.addonIds.push(source.addonId);
      if (episode.released && previous.released) {
        const differentDay = episode.released.slice(0, 10) !== previous.released.slice(0, 10);
        const differentInstant = episode.releasePrecision === 'instant' && previous.releasePrecision === 'instant' && episode.released !== previous.released;
        if (differentDay || differentInstant) previous.releaseConflicting = true;
        else if (episode.releasePrecision === 'instant') Object.assign(previous, { released: episode.released, releasePrecision: 'instant' });
      }
      if (!previous.released && episode.released) Object.assign(previous, { released: episode.released, releasePrecision: episode.releasePrecision });
      previous.thumbnail ??= episode.thumbnail; previous.overview ??= episode.overview;
    }
  }
  return [...byEpisode.values()].sort((a,b) => (a.season ?? Infinity) - (b.season ?? Infinity) || (a.episode ?? Infinity) - (b.episode ?? Infinity) || a.id.localeCompare(b.id)).map(episode => {
    const state = watchStates.filter(state => episode.videoIds.includes(state.video_id)).sort((a,b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))[0];
    // A date-only release has no known time. Treat today as unconfirmed until the UTC day ends.
    const releasedAt = episode.released && !episode.releaseConflicting ? Date.parse(episode.released) + (episode.releasePrecision === 'date' ? 86400000 : 0) : NaN;
    return { ...episode, releaseState: !Number.isFinite(releasedAt) ? 'unknown' : releasedAt <= now ? 'released' : 'upcoming', watched: Boolean(state?.watched), position_seconds: state?.position_seconds ?? 0 };
  });
}

export function addEpisodeRoutes(app, { db, userAddons, fetchMetadata, clock = Date.now, ttlMs = 6 * 60 * 60 * 1000 }) {
  const pending = new Map();
  app.get('/api/episodes/:type/:id', async (req, res) => {
    const { type, id } = req.params;
    if (type !== 'series' || !id || id.length > 512) return res.status(400).json({ error: 'A series ID is required' });
    const addons = (await userAddons(req)).filter(addon => addon.manifest.resources.some(resource => {
      const name = typeof resource === 'string' ? resource : resource.name;
      const types = typeof resource === 'string' ? addon.manifest.types : resource.types;
      const prefixes = typeof resource === 'string' ? addon.manifest.idPrefixes : resource.idPrefixes;
      return name === 'meta' && types.includes(type) && (!prefixes.length || prefixes.some(prefix => id.startsWith(prefix)));
    }));
    const sources = await Promise.all(addons.map(async addon => {
      const cached = await db.get('SELECT * FROM episode_catalogs WHERE user_id=? AND addon_id=? AND media_type=? AND media_id=?', req.user.id, addon.id, type, id);
      const fresh = cached && cached.source_version === addon.updated_at && clock() - Date.parse(cached.fetched_at) < ttlMs;
      if (fresh) return { addonId: addon.id, episodes: JSON.parse(cached.episodes_json), fetchedAt: cached.fetched_at, stale: false };
      const key = JSON.stringify([req.user.id, addon.id, type, id, addon.updated_at]);
      if (!pending.has(key)) {
        const fetch = async () => {
          const response = await fetchMetadata(addon, type, id);
          const episodes = normalizeEpisodes(response?.meta?.videos);
          const fetchedAt = new Date(clock()).toISOString();
          await db.run('INSERT INTO episode_catalogs(user_id,addon_id,media_type,media_id,source_version,episodes_json,fetched_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,addon_id,media_type,media_id) DO UPDATE SET source_version=excluded.source_version,episodes_json=excluded.episodes_json,fetched_at=excluded.fetched_at', req.user.id, addon.id, type, id, addon.updated_at, JSON.stringify(episodes), fetchedAt);
          return { addonId: addon.id, episodes, fetchedAt, stale: false };
        };
        pending.set(key, fetch().finally(() => pending.delete(key)));
      }
      try { return await pending.get(key); }
      catch { return { addonId: addon.id, episodes: cached ? JSON.parse(cached.episodes_json) : [], fetchedAt: cached?.fetched_at ?? null, stale: true, error: 'Episode metadata could not be refreshed' }; }
    }));
    const watched = await db.all('SELECT video_id,watched,position_seconds,updated_at FROM watch_states WHERE user_id=? AND profile_id=? AND media_type=? AND media_id=?', req.user.id, req.user.profile_id, type, id);
    res.json({ media_type: type, media_id: id, items: mergeEpisodeSources(sources, watched, clock()), stale: sources.some(source => source.stale), sources: sources.map(({addonId,fetchedAt,stale,error}) => ({addonId,fetchedAt,stale,...(error ? {error} : {})})) });
  });
}
