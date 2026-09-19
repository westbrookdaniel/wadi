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
it('keeps a local override saved while its legacy import is in flight', async () => {
  let finish: (value: { subtitle_size: number }) => void = () => { throw new Error('Import was not started') }
  const pending = deviceOverride('in-flight-title', () => new Promise(resolve => { finish = resolve }))
  await saveDeviceOverride('in-flight-title', { subtitle_size: 1.5 })
  finish({ subtitle_size: 0.75 })
  expect(await pending).toEqual({ subtitle_size: 1.5 })
})
it('reads changes made by another tab and preserves other fields on a partial save', async () => {
  await saveDeviceOverride('shared-title', { subtitle_size: 1.25 })
  localStorage.setItem('shared-title', JSON.stringify({ subtitle_size: 2, playback_speed: 1.5 }))
  expect(await deviceOverride('shared-title', async () => ({}))).toEqual({ subtitle_size: 2, playback_speed: 1.5 })
  expect(await saveDeviceOverride('shared-title', { playback_speed: 1 })).toEqual({ subtitle_size: 2, playback_speed: 1 })
})
