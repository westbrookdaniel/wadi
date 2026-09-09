export type SeriesSearchState = {
  from: string | undefined
  episode: string | undefined
  season: string | undefined
  videoId?: string | undefined
}

export function preferredEpisodeIdFromSearch({
  episode,
  videoId,
}: {
  episode?: string
  videoId?: string
}) {
  return episode ?? videoId
}

export function seasonToSearchParam(season: number | null) {
  if (season === 0) {
    return 'special'
  }
  return season === null ? 'extras' : String(season)
}

export function nextSeriesSearchState(
  previous: SeriesSearchState,
  season: number | null,
  episodeId: string | null,
): SeriesSearchState {
  const next: SeriesSearchState = {
    ...previous,
    season: seasonToSearchParam(season),
    episode: episodeId || undefined,
  }
  delete next.videoId
  return next
}

export function readLastSeason(profileId: string | null, mediaId: string): number | null | undefined {
  try {
    const raw = localStorage.getItem(`wadi.last-season.${profileId}.${mediaId}`)
    if (raw === null) return undefined
    const value: unknown = JSON.parse(raw)
    return value === null || typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
  } catch { return undefined }
}

export function saveLastSeason(profileId: string | null, mediaId: string, season: number | null) {
  try { localStorage.setItem(`wadi.last-season.${profileId}.${mediaId}`, JSON.stringify(season)) } catch { /* Browsing remains available without storage. */ }
}

export function formatEpisodeReleaseDate(released: string | undefined) {
  if (!released) return null
  const date = new Date(released)
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : null
}
