import type { StreamInfo } from '@/api/types'

export type PlayableStream = StreamInfo & { addon_id?: string }

export type PlaybackTarget = {
  mediaType: string
  mediaId: string
  videoId: string | null
  overrideMediaId?: string
  seriesEpisodes?: Episode[]
  episodeContext?: {
    season: number | null
    episode: number | null
    title: string
  } | null
}

export type Episode = {
  videoIds?: string[]
  id: string
  title: string
  season: number | null
  episode: number | null
  released?: string
  overview?: string
  thumbnail?: string
}
