import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MediaPlayerPage } from './media-player-page'
import { initialLocalPlaybackState, initialPlayerState } from './state'
import { useAutoPlayback } from '@/store/auto-playback'
import { useAppStore } from '@/store/app-store'
import { useSourceHistory } from '@/store/source-history'

const mocks = vi.hoisted(() => ({ request: vi.fn(), options: vi.fn(), update: vi.fn(), time: 42, playing: false }))
const sources = [{ url: 'https://example.test/1080', title: '1080p H.264', behaviorHints: { bingeGroup: 'release-a' } }, { url: 'https://example.test/720', title: '720p H.264', behaviorHints: { bingeGroup: 'release-a' } }]
vi.mock('@/api/client', () => ({ apiRequest: mocks.request, ApiError: Error }))
vi.mock('@/lib/desktop', () => ({ desktopBridge: () => undefined }))
vi.mock('./use-player-preferences', () => ({ usePlayerPreferences: () => ({ playbackState: initialLocalPlaybackState, updatePlaybackState: mocks.update, resetToDefaults: mocks.update }) }))
vi.mock('./use-mediabunny-player', () => ({ useMediabunnyPlayer: (options: { url?: string; savedPosition: number }) => {
  mocks.options(options)
  return { state: { ...initialPlayerState, status: options.url ? 'ready' : 'idle', sourceUrl: options.url, duration: options.url ? 1000 : 0, currentTime: options.url === sources[1].url ? options.savedPosition : mocks.time, playing: mocks.playing, hasVideo: true }, play: mocks.update, pause: mocks.update, seek: mocks.update, setVolume: mocks.update, setAudioTrack: mocks.update, setPlaybackSpeed: mocks.update, toggleMute: mocks.update, toggle: mocks.update }
} }))
const transport = { setOptions: async () => {}, getCastState: () => 'disconnected', on: () => {}, off: () => {}, sendMessage: async () => {} }
vi.mock('../chromecast', () => ({ getChromecastTransport: () => transport }))
beforeEach(() => {
  mocks.time = 42; mocks.playing = false
  useAutoPlayback.getState().reset()
  mocks.request.mockImplementation(async (path: string, options?: { body?: unknown }) => {
    if (path.includes('playback-settings')) return { settings: null }
    if (path.includes('introdb')) return { enabled: false }
    if (path.includes('/settings/playback')) return { stream_action: 'internal', external_player_template: 'vlc://{url}' }
    if (path.includes('/watch-data/')) return { items: [], media_type: 'movie', media_id: 'film' }
    if (path.includes('/watch-progress')) return { ...(options?.body as object), updated_at: new Date().toISOString() }
    if (path.includes('/streams/')) return { responses: [{ addon_id: 'provider', response: { streams: sources } }] }
    if (path.includes('/subtitles/')) return { responses: [] }
    return { items: [] }
  })
})
afterEach(() => { vi.clearAllMocks(); useAutoPlayback.getState().reset(); useAppStore.setState({ activeProfileId: null }); useSourceHistory.setState({ reliability: {}, families: {}, familyChoices: {} }); localStorage.clear() })
function show(series = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const change = vi.fn()
  const target = series ? { mediaType: 'series', mediaId: 'show', videoId: 'one', seriesEpisodes: [{ id: 'one', season: 1, episode: 1, title: 'One' }, { id: 'two', season: 1, episode: 2, title: 'Two', released: '2020-01-01' }], episodeContext: { season: 1, episode: 1, title: 'One' } } : { mediaType: 'movie', mediaId: 'film', videoId: null }
  const view = render(<QueryClientProvider client={client}><MediaPlayerPage media={{ id: target.mediaId, type: target.mediaType, name: 'Film', raw: {} }} stream={sources[0]} target={target} onBack={() => {}} onPlaybackChange={change} /></QueryClientProvider>)
  return { ...view, change, client }
}

it('switches to the requested resolution at the paused position and retains the playback session', async () => {
  const view = show()
  await waitFor(() => expect(mocks.options).toHaveBeenLastCalledWith(expect.objectContaining({ url: sources[0].url })))
  fireEvent.click(screen.getByRole('button', { name: 'Quality & sources' }))
  const quality = await screen.findByRole('combobox', { name: 'Playback quality' })
  await waitFor(() => expect(quality).toBeEnabled())
  fireEvent.change(quality, { target: { value: '720' } })
  await waitFor(() => expect(mocks.options).toHaveBeenLastCalledWith(expect.objectContaining({ url: sources[1].url, savedPosition: 42, watched: false, autoPlay: false })))
  expect(view.change).toHaveBeenCalledWith(expect.objectContaining({ url: sources[1].url }), expect.objectContaining({ mediaId: 'film' }))
  view.unmount(); view.client.clear()
})

it('prefetches next-episode sources near the end once, without opening another player', async () => {
  useAutoPlayback.getState().update({ autoplayNext: true, prefetchNext: true })
  mocks.time = 900; mocks.playing = true
  const view = show(true)
  await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/api/streams/series/two', expect.objectContaining({ signal: expect.any(AbortSignal) })))
  expect(mocks.request.mock.calls.filter(([path]) => path === '/api/streams/series/two')).toHaveLength(1)
  expect(view.change).not.toHaveBeenCalled()
  expect(mocks.options.mock.calls.every(([options]) => !options.url || options.url === sources[0].url)).toBe(true)
  view.unmount(); view.client.clear()
})
