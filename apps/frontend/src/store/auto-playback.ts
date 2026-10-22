import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { z } from 'zod'

import { autoPlaybackSchema, defaultAutoPlayback } from '../../shared/auto-playback.js'
export { autoPlaybackSchema, defaultAutoPlayback }

export type AutoPlaybackSettings = z.infer<typeof autoPlaybackSchema>
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
