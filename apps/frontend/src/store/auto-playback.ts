import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { z } from 'zod'

export const autoPlaybackSchema = z.object({
  enabled: z.boolean().default(false),
  skipSelection: z.boolean().default(false),
  autoplayNext: z.boolean().default(false),
  countdownSeconds: z.number().int().min(3).max(30).default(10),
  preferredResolution: z.number().int().min(480).max(2160).default(1080),
  maxResolution: z.number().int().min(480).max(2160).default(2160),
  maxSizeGB: z.number().min(0).max(100).default(0),
  qualityWeight: z.number().min(0).max(100).default(70),
  sizeWeight: z.number().min(0).max(100).default(30),
  codec: z.enum(['any', 'H.264', 'HEVC', 'AV1']).default('any'),
  language: z.string().max(20).default('any'),
  preferredAddon: z.string().max(512).default(''),
  excludeCam: z.boolean().default(true),
  allowHdr: z.boolean().default(true),
  allowUnknown: z.boolean().default(true),
  excludedWords: z.string().max(500).default(''),
})
export type AutoPlaybackSettings = z.infer<typeof autoPlaybackSchema>
export const defaultAutoPlayback = autoPlaybackSchema.parse({})
export const useAutoPlayback = create(persist<{
  settings: AutoPlaybackSettings
  update: (patch: Partial<AutoPlaybackSettings>) => void
  reset: () => void
}>((set) => ({
  settings: defaultAutoPlayback,
  update: patch => set(state => ({ settings: autoPlaybackSchema.parse({ ...state.settings, ...patch }) })),
  reset: () => set({ settings: defaultAutoPlayback }),
}), {
  name: 'wadi.device.auto-playback.v1',
  merge: (persisted, current) => {
    const result = z.object({ settings: autoPlaybackSchema }).safeParse(persisted)
    return { ...current, settings: result.success ? result.data.settings : defaultAutoPlayback }
  },
}))
