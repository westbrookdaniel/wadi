import { expect, it } from 'vitest'
import { autoPlaybackSchema } from './auto-playback'

it('adds timing defaults without dropping existing device preferences', () => {
  expect(autoPlaybackSchema.parse({ autoplayNext: true, countdownSeconds: 20, codec: 'HEVC' })).toMatchObject({ autoplayNext: true, countdownSeconds: 20, codec: 'HEVC', nextEpisodeLeadSeconds: 0, ignoreStartSeconds: 0, finishRemainingSeconds: 0 })
})
it('rejects invalid timing preferences', () => {
  for (const patch of [{ nextEpisodeLeadSeconds: -1 }, { nextEpisodeLeadSeconds: 601 }, { ignoreStartSeconds: 301 }, { finishRemainingSeconds: 1.5 }]) expect(autoPlaybackSchema.safeParse(patch).success).toBe(false)
})
