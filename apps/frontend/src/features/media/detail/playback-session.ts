import { z } from 'zod'
import { useAppStore } from '@/store/app-store'
import type { PlayableStream, PlaybackTarget } from './types'

const optionalText = z.string().optional()
const episode = z.object({ id: z.string(), title: z.string(), season: z.number().nullable(), episode: z.number().nullable(), released: optionalText, overview: optionalText, thumbnail: optionalText })
const sessionSchema = z.object({
  savedAt: z.number().finite().nonnegative().optional(),
  stream: z.object({ title: optionalText, name: optionalText, url: optionalText, externalUrl: optionalText, infoHash: optionalText, fileIdx: z.number().optional(), addon_id: optionalText,
    subtitles: z.array(z.object({ id: optionalText, lang: optionalText, url: optionalText }).passthrough()).optional(),
    behaviorHints: z.object({ videoHash: optionalText, videoSize: z.number().optional(), filename: optionalText }).passthrough().optional(),
  }).passthrough(),
  target: z.object({ mediaType: z.string(), mediaId: z.string(), videoId: z.string().nullable(), overrideMediaId: optionalText, seriesEpisodes: z.array(episode).optional(), episodeContext: episode.omit({ id: true, released: true, overview: true, thumbnail: true }).nullable().optional() }),
})
function storageKey(key: string) {
  return `wadi.playback.${useAppStore.getState().activeProfileId}.${key}`
}
const sessionFallback = new Map<string, string>()
const sessionLimit = 20
const sessionLifetime = 24 * 60 * 60 * 1000
const isSessionKey = (key: string) => /^wadi\.playback\..+\.[0-9a-f-]{36}$/i.test(key)
function sessionTimestamp(value: string) {
  try { return sessionSchema.safeParse(JSON.parse(value)).data?.savedAt ?? 0 } catch { return 0 }
}
function pruneSessions() {
  const now = Date.now()
  const entries = new Map<string, number>()
  try {
    for (let index = 0; index < sessionStorage.length; index++) {
      const key = sessionStorage.key(index)
      if (key && isSessionKey(key)) entries.set(key, sessionTimestamp(sessionStorage.getItem(key) ?? 'null'))
    }
  } catch { /* Memory fallback remains available when storage is blocked. */ }
  for (const [key, value] of sessionFallback) entries.set(key, sessionTimestamp(value))
  const ordered = [...entries].sort((a, b) => b[1] - a[1])
  ordered.forEach(([key, timestamp], index) => {
    if (index < sessionLimit && (!timestamp || now - timestamp < sessionLifetime)) return
    sessionFallback.delete(key)
    try { sessionStorage.removeItem(key) } catch { /* Storage may be blocked. */ }
  })
}
export function savePlaybackSession(stream: PlayableStream, target: PlaybackTarget) {
  pruneSessions()
  const key = crypto.randomUUID()
  const value = JSON.stringify({ stream, target, savedAt: Date.now() })
  try { sessionStorage.setItem(storageKey(key), value) } catch {
    sessionFallback.set(storageKey(key), value)
  }
  pruneSessions()
  return key
}
export function readPlaybackSession(key: string | undefined, type: string, id: string) {
  if (!key) return null
  try {
    const fallback = sessionFallback.get(storageKey(key))
    const result = sessionSchema.safeParse(JSON.parse(fallback ?? sessionStorage.getItem(storageKey(key)) ?? 'null'))
    if (!result.success || result.data.target.mediaType !== type || result.data.target.mediaId !== id) return null
    if (result.data.savedAt !== undefined && Date.now() - result.data.savedAt >= sessionLifetime) return null
    return { stream: result.data.stream, target: result.data.target }
  } catch { return null }
}
type Checkpoint = { position: number; updatedAt: number; recordedAt?: number }
const checkpointSchema = z.object({ position: z.number().finite().nonnegative(), updatedAt: z.number().finite().nonnegative(), recordedAt: z.number().finite().nonnegative().optional() })
export function savePlaybackPosition(target: PlaybackTarget, position: number, updatedAt?: number) {
  const checkpoint = checkpointSchema.safeParse({ position, updatedAt: updatedAt ?? Math.max(Date.now(), (readCheckpoint(target)?.updatedAt ?? 0) + 1) })
  if (!checkpoint.success) return undefined
  writeCheckpoint(target, { ...checkpoint.data, recordedAt: checkpoint.data.updatedAt })
  return checkpoint.data.updatedAt
}
function writeCheckpoint(target: PlaybackTarget, value: Checkpoint) {
  try { localStorage.setItem(storageKey(`position.${target.mediaType}.${target.mediaId}.${target.videoId ?? ''}`), JSON.stringify(value)) } catch { /* Playback can continue if storage is full. */ }
}
function readCheckpoint(target: PlaybackTarget): Checkpoint | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(`position.${target.mediaType}.${target.mediaId}.${target.videoId ?? ''}`)) ?? 'null')
    // Legacy numbers have no freshness; use only when no server progress exists.
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return { position: value, updatedAt: 0 }
    const parsed = checkpointSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  } catch { return null }
}
export function readPlaybackPosition(target: PlaybackTarget) {
  return readCheckpoint(target)?.position ?? null
}
export function reconcilePlaybackPosition(target: PlaybackTarget, server: { position_seconds: number; updated_at: string | null }) {
  const local = readCheckpoint(target)
  if (!local) return server.position_seconds
  const serverTime = server.updated_at ? Date.parse(server.updated_at) : NaN
  if (!Number.isFinite(serverTime)) return local.position
  // Compare freshness, never distance: a later rewind is intentional. Server wins ties.
  return local.updatedAt > serverTime && local.updatedAt <= Date.now() + 60000 ? local.position : server.position_seconds
}

// A response timestamps receipt at the server, not when the user acted. Keep a
// later unsynced local seek newer than acknowledgement of an earlier request.
export function acknowledgePlaybackPosition(target: PlaybackTarget, submittedAt: number, server: { position_seconds: number; updated_at: string | null }) {
  const current = readCheckpoint(target)
  const acceptedAt = server.updated_at ? Date.parse(server.updated_at) : NaN
  if (!current || !Number.isFinite(acceptedAt)) return
  const recordedAt = current.recordedAt ?? current.updatedAt
  if (recordedAt === submittedAt) writeCheckpoint(target, { ...current, position: server.position_seconds, updatedAt: acceptedAt })
  else if (recordedAt > submittedAt && current.updatedAt <= acceptedAt) writeCheckpoint(target, { ...current, updatedAt: acceptedAt + 1 })
}

const subtitleChoiceSchema = z.object({ id: z.string().nullable(), language: z.string().nullable() })
export function saveSubtitleChoice(target: PlaybackTarget, choice: z.infer<typeof subtitleChoiceSchema>) {
  try { localStorage.setItem(storageKey(`subtitles.${target.mediaType}.${target.mediaId}`), JSON.stringify(choice)) } catch { /* Keep the in-memory choice when storage is unavailable. */ }
}
export function readSubtitleChoice(target: PlaybackTarget) {
  try { const parsed = subtitleChoiceSchema.safeParse(JSON.parse(localStorage.getItem(storageKey(`subtitles.${target.mediaType}.${target.mediaId}`)) ?? 'null')); return parsed.success ? parsed.data : undefined } catch { return undefined }
}

export function clearSubtitleChoice(target: PlaybackTarget) {
  try { localStorage.removeItem(storageKey(`subtitles.${target.mediaType}.${target.mediaId}`)) } catch { /* Defaults still apply in memory. */ }
}
