import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { z } from 'zod'
import type { PlayableStream, PlaybackTarget } from '@/features/media/detail/types'
import { parseStreamMetadata } from '@/features/media/detail/stream-metadata'

const resultSchema = z.object({ successes: z.number().int().nonnegative(), failures: z.number().int().nonnegative(), updatedAt: z.number() })
const historySchema = z.object({ reliability: z.record(z.string(), resultSchema), families: z.record(z.string(), z.string().max(512)), familyChoices: z.record(z.string(), z.boolean()).default({}) })
type History = z.infer<typeof historySchema>
const empty: History = { reliability: {}, families: {}, familyChoices: {} }

// Persist provider-level results only, never private stream URLs or filenames.
export function sourceProviderKey(stream: PlayableStream) {
  if (stream.addon_id) return stream.addon_id
  try { return new URL(stream.url ?? '').hostname } catch { return 'unknown' }
}
export function seasonKey(profile: string | null, target: PlaybackTarget) {
  return JSON.stringify([profile, target.mediaType, target.mediaId, target.episodeContext?.season ?? null])
}
export function reliabilityKey(profile: string | null, stream: PlayableStream) {
  const metadata = parseStreamMetadata(stream)
  return JSON.stringify([profile, sourceProviderKey(stream), metadata.codec.value])
}
function keyProfile(key: string) {
  try { return JSON.parse(key)[0] as string | null } catch { return null }
}
function bounded<T>(entries: Record<string, T>, key: string, value: T) {
  const next = { ...entries }
  delete next[key]
  next[key] = value
  return Object.fromEntries(Object.entries(next).slice(-100))
}
export const useSourceHistory = create(persist<History & {
  record: (profile: string | null, stream: PlayableStream, success: boolean) => void
  rememberFamily: (profile: string | null, target: PlaybackTarget, stream: PlayableStream) => void
  setFamilyChoice: (profile: string | null, target: PlaybackTarget, keep: boolean) => void
  clear: (profile: string | null) => void
}, [], [], History>((set) => ({
  ...empty,
  record: (profile, stream, success) => set(state => {
    const key = reliabilityKey(profile, stream)
    const prior = state.reliability[key]
    const recent = prior && Date.now() - prior.updatedAt < 7 * 86400000 ? prior : { successes: 0, failures: 0 }
    return { reliability: bounded(state.reliability, key, { successes: Math.min(10, recent.successes + Number(success)), failures: Math.min(10, recent.failures + Number(!success)), updatedAt: Date.now() }) }
  }),
  rememberFamily: (profile, target, stream) => set(state => {
    const family = parseStreamMetadata(stream).bingeGroup.value
    return family && family.length <= 512 && target.mediaType === 'series' ? { families: bounded(state.families, seasonKey(profile, target), family) } : {}
  }),
  setFamilyChoice: (profile, target, keep) => set(state => ({ familyChoices: bounded(state.familyChoices, seasonKey(profile, target), keep) })),
  clear: profile => set(state => ({
    reliability: Object.fromEntries(Object.entries(state.reliability).filter(([key]) => keyProfile(key) !== profile)),
    familyChoices: Object.fromEntries(Object.entries(state.familyChoices).filter(([key]) => keyProfile(key) !== profile)),
    families: Object.fromEntries(Object.entries(state.families).filter(([key]) => keyProfile(key) !== profile)),
  })),
}), {
  name: 'wadi.source-history.v1',
  storage: createJSONStorage(() => ({
    getItem: key => { try { return localStorage.getItem(key) } catch { return null } },
    setItem: (key, value) => { try { localStorage.setItem(key, value) } catch { /* Playback remains usable without storage. */ } },
    removeItem: key => { try { localStorage.removeItem(key) } catch { /* Storage may be blocked. */ } },
  })),
  partialize: state => ({ reliability: state.reliability, families: state.families, familyChoices: state.familyChoices }),
  merge: (persisted, current) => {
    const parsed = historySchema.safeParse(persisted)
    return { ...current, ...(parsed.success ? parsed.data : empty) }
  },
}))
