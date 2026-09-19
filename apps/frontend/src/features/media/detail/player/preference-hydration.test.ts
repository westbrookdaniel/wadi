import { createElement, type PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { usePlayerPreferences } from './use-player-preferences'
import type { PlayerOverride, PlayerPreferences } from '@/api/types'
import { queryKeys } from '@/api/queries'
import { useAppStore } from '@/store/app-store'
const request = vi.hoisted(() => vi.fn())
vi.mock('@/api/client', () => ({ apiRequest: request, ApiError: Error }))
const defaults: PlayerPreferences = {
  subtitles_enabled: true, subtitle_language: null, subtitle_delay_seconds: 0,
  subtitle_size: 1, subtitle_position: 0, subtitle_text_color: '#FFFFFF',
  subtitle_background_color: '#000000', subtitle_background_opacity: 0,
  subtitle_outline_color: '#000000', subtitle_outline_style: 'outline', subtitle_font_family: 'sans-serif',
  subtitle_offset_x: 0, subtitle_offset_y: 0, playback_speed: 1,
  preferred_audio_language: null, preferred_audio_track_id: null,
}
it('hydrates a delayed title override after device defaults are already cached', async () => {
  localStorage.clear()
  useAppStore.getState().setActiveProfileId('hydration-profile')
  const pending = Promise.withResolvers<PlayerOverride>()
  request.mockReturnValue(pending.promise)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(queryKeys.playerDefaults, defaults)
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children)
  const hook = renderHook(() => usePlayerPreferences({ mediaType: 'series', overrideMediaId: 'delayed-title', streamSubtitleList: [], streamSubtitlesLoading: true }), { wrapper })
  try {
    await waitFor(() => expect(request).toHaveBeenCalled())
    await act(async () => { pending.resolve({ playback_speed: 2, subtitle_size: 1.5 }); await pending.promise })
    await waitFor(() => expect(hook.result.current.playbackState.playbackSpeed).toBe(2))
    expect(hook.result.current.playbackState.subtitleSize).toBe(1.5)
  } finally { hook.unmount(); client.clear(); useAppStore.getState().setActiveProfileId(null); localStorage.clear() }
})
