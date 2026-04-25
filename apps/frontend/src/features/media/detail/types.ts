import type { StreamInfo } from '@/api/types'

export type PlayableStream = StreamInfo & { addon_id?: string }

export type PlaybackTarget = {
  mediaType: string
  mediaId: string
  videoId: string | null
}

export type Episode = {
  id: string
  title: string
  season: number | null
  episode: number | null
  released?: string
  overview?: string
  thumbnail?: string
}
