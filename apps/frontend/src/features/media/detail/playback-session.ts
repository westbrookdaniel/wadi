import { z } from 'zod'
import { useAppStore } from '@/store/app-store'
import type { PlayableStream, PlaybackTarget } from './types'

const optionalText = z.string().optional()
const episode = z.object({ id: z.string(), title: z.string(), season: z.number().nullable(), episode: z.number().nullable(), released: optionalText, overview: optionalText, thumbnail: optionalText })
const sessionSchema = z.object({
  stream: z.object({ title: optionalText, name: optionalText, url: optionalText, externalUrl: optionalText, infoHash: optionalText, fileIdx: z.number().optional(), addon_id: optionalText,
    subtitles: z.array(z.object({ id: optionalText, lang: optionalText, url: optionalText }).passthrough()).optional(),
    behaviorHints: z.object({ videoHash: optionalText, videoSize: z.number().optional(), filename: optionalText }).passthrough().optional(),
  }).passthrough(),
  target: z.object({ mediaType: z.string(), mediaId: z.string(), videoId: z.string().nullable(), overrideMediaId: optionalText, seriesEpisodes: z.array(episode).optional(), episodeContext: episode.omit({ id: true, released: true, overview: true, thumbnail: true }).nullable().optional() }),
})
function storageKey(key: string) {
  return `wadi.playback.${useAppStore.getState().activeProfileId}.${key}`
}
export function savePlaybackSession(stream: PlayableStream, target: PlaybackTarget) {
  const key = crypto.randomUUID()
  sessionStorage.setItem(storageKey(key), JSON.stringify({ stream, target }))
  return key
}
export function readPlaybackSession(key: string | undefined, type: string, id: string) {
  if (!key) return null
  try {
    const result = sessionSchema.safeParse(JSON.parse(sessionStorage.getItem(storageKey(key)) ?? 'null'))
    return result.success && result.data.target.mediaType === type && result.data.target.mediaId === id ? result.data : null
  } catch { return null }
}
export function savePlaybackPosition(target: PlaybackTarget, position: number) {
  try { localStorage.setItem(storageKey(`position.${target.mediaType}.${target.mediaId}.${target.videoId ?? ''}`), JSON.stringify(position)) } catch { /* Playback can continue if storage is full. */ }
}
export function readPlaybackPosition(target: PlaybackTarget) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(`position.${target.mediaType}.${target.mediaId}.${target.videoId ?? ''}`)) ?? 'null')
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
  } catch { return null }
}

const subtitleChoiceSchema = z.object({ id: z.string().nullable(), language: z.string().nullable() })
export function saveSubtitleChoice(target: PlaybackTarget, choice: z.infer<typeof subtitleChoiceSchema>) {
  try { localStorage.setItem(storageKey(`subtitles.${target.mediaType}.${target.mediaId}`), JSON.stringify(choice)) } catch { /* Keep the in-memory choice when storage is unavailable. */ }
}
export function readSubtitleChoice(target: PlaybackTarget) {
  try { const parsed = subtitleChoiceSchema.safeParse(JSON.parse(localStorage.getItem(storageKey(`subtitles.${target.mediaType}.${target.mediaId}`)) ?? 'null')); return parsed.success ? parsed.data : undefined } catch { return undefined }
}
