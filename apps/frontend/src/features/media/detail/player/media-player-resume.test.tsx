import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MediaPlayerPage } from './media-player-page'
import { initialLocalPlaybackState, initialPlayerState } from './state'
import { queryKeys } from '@/api/queries'
import { readPlaybackPosition, savePlaybackPosition } from '../playback-session'
import type { WatchDataResponse } from '@/api/types'

const mocks = vi.hoisted(() => ({ request: vi.fn(), desktop: vi.fn(), desktopPlayer: vi.fn(), canvases: vi.fn(), url: vi.fn(), update: vi.fn(), reset: vi.fn() }))
vi.mock('@/api/client', () => ({ apiRequest: mocks.request, ApiError: Error }))
vi.mock('@/lib/desktop', () => ({ desktopBridge: mocks.desktop }))
vi.mock('./use-player-preferences', () => ({ usePlayerPreferences: () => ({ playbackState: initialLocalPlaybackState, updatePlaybackState: mocks.update, resetToDefaults: mocks.reset }) }))
vi.mock('./use-desktop-player', () => ({ useDesktopPlayer: (options: unknown) => { mocks.desktopPlayer(options); return { state: initialPlayerState, play: mocks.update, pause: mocks.update, seek: mocks.update, setVolume: mocks.update, setAudioTrack: mocks.update, setPlaybackSpeed: mocks.update, toggleMute: mocks.update, retry: mocks.update } } }))
vi.mock('../chromecast', () => ({ getChromecastTransport: () => transport }))
const transport = { setOptions: async () => {}, getCastState: () => 'disconnected', on: () => {}, off: () => {}, sendMessage: async () => {} }
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  UrlSource: class { constructor(url: string) { mocks.url(url) } },
  Input: class { computeDuration = async () => 1000; getAudioTracks = async () => []; getPrimaryVideoTrack = async () => ({ codec: 'h264', displayWidth: 1280, displayHeight: 720, canDecode: async () => true, canBeTransparent: async () => false }); dispose() {} },
  CanvasSink: class { canvases(position: number) { mocks.canvases(position); return { next: async () => ({ done: true }), return: async () => ({ done: true }) } } },
  AudioBufferSink: class {},
}))
const target = { mediaType: 'movie', mediaId: 'film', videoId: null }
const progress = (position: number, time: number): WatchDataResponse => ({ media_type: 'movie', media_id: 'film', items: [{ media_type: 'movie', media_id: 'film', video_id: null, watched: false, position_seconds: position, duration_seconds: 1000, updated_at: new Date(time).toISOString() }] })
beforeEach(() => {
  mocks.desktop.mockReturnValue(undefined)
  vi.stubGlobal('AudioContext', class { state = 'suspended'; currentTime = 0; destination = {}; createGain() { return { gain: { value: 0 }, connect() {} } }; close = async () => {} })
})
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); localStorage.clear() })

it.each(['web', 'desktop'])('%s waits for the current server fetch and receives the latest rewind', async path => {
  if (path === 'desktop') mocks.desktop.mockReturnValue({})
  const now = Date.now()
  savePlaybackPosition(target, 300, now - 20000)
  const pending = Promise.withResolvers<WatchDataResponse>()
  const writes: Array<{ position: number; resolve: (value: unknown) => void }> = []
  mocks.request.mockImplementation(async (url: string, options?: { body?: Record<string, unknown> }) => {
    if (url.startsWith('/api/watch-data')) return pending.promise
    if (url === '/api/watch-progress') return new Promise(resolve => writes.push({ position: Number(options?.body?.position_seconds), resolve }))
    if (url.includes('introdb')) return { enabled: false }
    if (url.includes('subtitles')) return { responses: [] }
    if (url.includes('playback')) return { stream_action: 'internal', external_player_template: 'vlc://{url}' }
    return { items: [] }
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(queryKeys.watchData('movie', 'film'), progress(300, now - 20000))
  const view = render(<QueryClientProvider client={client}><MediaPlayerPage media={{ id: 'film', type: 'movie', name: 'Film', raw: {} }} stream={{ url: 'https://example.com/film.mp4' }} target={target} onBack={() => {}} /></QueryClientProvider>)
  expect(mocks.url).not.toHaveBeenCalled()
  expect(mocks.desktopPlayer.mock.calls.every(([options]) => !options.source)).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(readPlaybackPosition(target)).toBe(300)
  expect(writes).toHaveLength(0)
  await act(async () => { pending.resolve(progress(30, now - 10000)); await pending.promise })
  if (path === 'web') {
    await waitFor(() => expect(mocks.canvases).toHaveBeenCalledWith(30))
    expect(mocks.canvases).not.toHaveBeenCalledWith(300)
    expect(mocks.url).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(writes).toHaveLength(1))
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Seek Film' }), { key: 'ArrowLeft' })
    await waitFor(() => expect(mocks.canvases).toHaveBeenCalledWith(25))
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Seek Film' }), { key: 'ArrowLeft' })
    await waitFor(() => expect(mocks.canvases).toHaveBeenCalledWith(20))
    expect(writes.map(write => write.position)).toEqual([30])
    await act(async () => writes[0].resolve(progress(30, Date.now()).items[0]))
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(readPlaybackPosition(target)).toBe(20)
    await act(async () => writes[1].resolve(progress(writes[1].position, Date.now()).items[0]))
    await waitFor(() => expect(writes).toHaveLength(3))
    expect(writes.map(write => write.position)).toEqual([30, 25, 20])
    await act(async () => writes[2].resolve(progress(20, Date.now()).items[0]))
  } else {
    await waitFor(() => expect(mocks.desktopPlayer).toHaveBeenLastCalledWith(expect.objectContaining({ source: 'https://example.com/film.mp4', savedPosition: 30 })))
    expect(mocks.url).not.toHaveBeenCalled()
  }
  view.unmount(); client.clear()
})
