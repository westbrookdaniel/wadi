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
