import { queryOptions } from '@tanstack/react-query'
import { apiRequest } from '@/api/client'
import type { PlaybackTarget } from '../types'

export type SkipSegment = { type: 'intro' | 'recap' | 'outro'; start: number; end: number }
export const skipLabels = { intro: 'Skip intro', recap: 'Skip recap', outro: 'Skip outro' }

export function segmentParams(target: PlaybackTarget): string | null {
  if (!/^tt\d{7,10}$/.test(target.mediaId)) return null
  const params = new URLSearchParams({ imdb_id: target.mediaId })
  if (target.mediaType === 'movie') params.set('is_movie', 'true')
  else if (target.mediaType === 'series') {
    const video = target.videoId?.match(/^(tt\d{7,10}):(\d+):(\d+)$/)
    const season = target.episodeContext?.season ?? (video?.[1] === target.mediaId ? Number(video[2]) : null)
    const episode = target.episodeContext?.episode ?? (video?.[1] === target.mediaId ? Number(video[3]) : null)
    if (season === null || episode === null || !Number.isInteger(season) || !Number.isInteger(episode)
      || season < 0 || episode < 1 || season > 99999 || episode > 99999) return null
    params.set('season', String(season)); params.set('episode', String(episode))
  } else return null
  return params.toString()
}

export function skipSegmentsQuery(target: PlaybackTarget, enabled = false, accountRevision = 0) {
  const params = segmentParams(target)
  return queryOptions({
    queryKey: ['skip-segments', accountRevision, params],
    enabled: enabled && params !== null,
    queryFn: async ({ signal }) => (await apiRequest<{ items: SkipSegment[] }>(`/api/skip-segments?${params}`, { signal })).items,
    staleTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

export function activeSegment(segments: SkipSegment[], time: number, duration: number): SkipSegment | undefined {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return undefined
  // Do not seek beyond this release's runtime or skip through a post-credits scene.
  return segments.find(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end)
    && segment.start >= 0 && segment.end > segment.start && segment.end <= duration
    && time >= segment.start && time < segment.end)
}
