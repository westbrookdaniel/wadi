import { expect, it, vi } from 'vitest'
import { devicePlayback, saveDevicePlayback, deviceOverride, saveDeviceOverride } from './playback-settings'
it('imports legacy playback once and keeps subsequent changes local', async () => {
  const legacy = vi.fn(async () => ({ stream_action: 'copy' as const, external_player_template: 'vlc://{url}' }))
  expect((await devicePlayback(legacy)).stream_action).toBe('copy')
  await saveDevicePlayback({stream_action:'external',external_player_preset:'iina',external_player_template:'vlc://{url}'})
  expect((await devicePlayback(legacy)).external_player_preset).toBe('iina')
  expect(legacy).toHaveBeenCalledTimes(1)
})
it('keeps per-title device overrides isolated by profile', async () => {
  await saveDeviceOverride('alice-film', { subtitle_size: 1.5 })
  expect(await deviceOverride('bob-film', async () => ({}))).toEqual({})
  expect(await deviceOverride('alice-film', async () => ({}))).toEqual({subtitle_size:1.5})
})
