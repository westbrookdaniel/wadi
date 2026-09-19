import { z } from 'zod'
import type { PlaybackPreferences, PlayerOverride, PlayerPreferences } from '@/api/types'
import { normalizePlaybackPreferences } from '@/features/media/detail/stream-playback'

const playbackSchema = z.object({
  stream_action: z.enum(['internal', 'external', 'copy']),
  external_player_template: z.string(), external_player_preset: z.string().optional(),
})
const playerSchema = z.object({
  subtitles_enabled: z.boolean(), subtitle_language: z.string().nullable(),
  subtitle_delay_seconds: z.number().finite(), subtitle_size: z.number().min(0.1).max(5),
  subtitle_position: z.number().finite(), subtitle_text_color: z.string(),
  subtitle_background_color: z.string(), subtitle_background_opacity: z.number().min(0).max(1),
  subtitle_outline_color: z.string(), subtitle_outline_style: z.string(), subtitle_font_family: z.string(),
  subtitle_offset_x: z.number().finite(), subtitle_offset_y: z.number().finite(),
  playback_speed: z.number().min(0.25).max(4), preferred_audio_language: z.string().nullable(),
  preferred_audio_track_id: z.string().nullable(),
})
const memory = new Map<string, unknown>()
function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return memory.get(key) ?? null }
}
function save(key: string, value: unknown) {
  // Continue to work in memory when browser storage is unavailable.
  memory.set(key, value)
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Session-only fallback. */ }
}
export const playbackKey = 'wadi.device.playback.v1'
export async function devicePlayback(loadLegacy: () => Promise<PlaybackPreferences>) {
  const stored = playbackSchema.safeParse(read(playbackKey))
  if (stored.success) return stored.data
  const imported = normalizePlaybackPreferences(await loadLegacy())
  // A settings save can finish while the legacy request is in flight.
  const latest = playbackSchema.safeParse(read(playbackKey))
  if (latest.success) return latest.data
  save(playbackKey, imported)
  return imported
}
export async function saveDevicePlayback(value: PlaybackPreferences) {
  const parsed = playbackSchema.parse(value); save(playbackKey, parsed); return parsed
}
export async function devicePlayer(key: string, loadLegacy: () => Promise<PlayerPreferences>) {
  const stored = playerSchema.safeParse(read(key))
  if (stored.success) return stored.data
  const imported = playerSchema.parse(await loadLegacy())
  const latest = playerSchema.safeParse(read(key))
  if (latest.success) return latest.data
  save(key, imported); return imported
}
export async function saveDevicePlayer(key: string, value: PlayerPreferences) {
  const parsed = playerSchema.parse(value); save(key, parsed); return parsed
}
export async function deviceOverride(key: string, loadLegacy: () => Promise<PlayerOverride>) {
  const stored = playerSchema.partial().safeParse(read(key))
  if (stored.success) return stored.data
  const imported = playerSchema.partial().parse(await loadLegacy())
  const latest = playerSchema.partial().safeParse(read(key))
  if (latest.success) return latest.data
  save(key, imported); return imported
}
export async function saveDeviceOverride(key: string, value: PlayerOverride) {
  const stored = playerSchema.partial().safeParse(read(key))
  const parsed = playerSchema.partial().parse({ ...(stored.success ? stored.data : {}), ...value }); save(key, parsed); return parsed
}
