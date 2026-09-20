import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { DesktopBridge } from '@/lib/desktop'
import { useDesktopPlayer } from './use-desktop-player'

// jsdom has no MediaSource or decoder. Only those browser/Electron boundaries are replaced.
vi.mock('hls.js', () => ({ default: class {
  static Events = { MANIFEST_PARSED: 'ready', ERROR: 'error' }
  listeners = new Map<string, () => void>()
  on(event: string, callback: () => void) { this.listeners.set(event, callback) }
  loadSource() {}
  attachMedia() { queueMicrotask(() => this.listeners.get('ready')?.()) }
  destroy() {}
} }))

afterEach(() => { delete window.wadiDesktop; vi.restoreAllMocks() })

it('keeps the conversion session on pause, resume, buffered seek and speed changes', async () => {
  const ended = vi.fn()
  const video = document.createElement('video')
  let paused = true
  Object.defineProperty(video, 'paused', { get: () => paused })
  Object.defineProperty(video, 'buffered', { value: { length: 1, start: () => 0, end: () => 30 } })
  vi.spyOn(video, 'play').mockImplementation(async () => { paused = false; video.dispatchEvent(new Event('play')) })
  vi.spyOn(video, 'pause').mockImplementation(() => { paused = true; video.dispatchEvent(new Event('pause')) })
  const load = vi.spyOn(video, 'load').mockImplementation(() => {})
  const media = vi.fn<DesktopBridge['media']>(async (action, payload) => {
    if (action !== 'start') return { error: null }
    const input = z.object({ id: z.string(), position: z.number() }).parse(payload)
    return { id: input.id, url: 'http://127.0.0.1/session/index.m3u8', offset: input.position, duration: 180, mode: 'audio', hasVideo: true, hasAudio: true, audioTracks: [], selectedAudioTrackId: null }
  })
  window.wadiDesktop = {
    getStartFullscreen: async () => false, setStartFullscreen: async value => value, onStartFullscreenChanged: () => () => {}, appVersion: async () => '0.1.0', updateState: async () => ({ kind: 'idle' }), checkUpdates: async () => ({ kind: 'idle' }), downloadUpdate: async () => {}, onUpdate: () => () => {},
    media, onOpenSettings: () => () => {}, openPage: async () => {}, session: async () => true,
    signIn: async () => true, request: async () => ({ status: 200, body: null }), openExternal: async () => {},
  }
  const videoRef = { current: video }
  const { result, unmount } = renderHook(() => useDesktopPlayer({ videoRef, source: 'https://example.com/movie.mkv', hints: {}, savedPosition: 0, watched: false, onProgressCommit: () => {}, onEnded: ended }))
  await waitFor(() => expect(result.current.state.playing).toBe(true))
  act(() => { video.currentTime = 12; video.dispatchEvent(new Event('timeupdate')); result.current.pause() })
  expect(result.current.state.currentTime).toBe(12)
  expect(result.current.state.status).toBe('ready')
  expect(result.current.state.playing).toBe(false)
  expect(load).not.toHaveBeenCalled()
  await act(() => result.current.play())
  expect(result.current.state.playing).toBe(true)
  await act(() => result.current.seek(20))
  act(() => result.current.setPlaybackSpeed(2))
  expect(video.currentTime).toBe(20)
  expect(video.playbackRate).toBe(2)
  expect(media.mock.calls.filter(([action]) => action === 'start')).toHaveLength(1)
  expect(media.mock.calls.filter(([action]) => action === 'stop')).toHaveLength(0)
  act(() => result.current.pause())
  await act(() => result.current.seek(100))
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  expect(result.current.state.playing).toBe(false)
  expect(media.mock.calls.filter(([action]) => action === 'start')).toHaveLength(2)
  act(() => { video.currentTime = 5; video.dispatchEvent(new Event('ended')) })
  expect(ended).not.toHaveBeenCalled()
  act(() => { video.currentTime = 80; video.dispatchEvent(new Event('ended')) })
  expect(ended).toHaveBeenCalledOnce()
  unmount()
  expect(media.mock.calls.filter(([action]) => action === 'stop')).toHaveLength(2)
})

it('honors pause, resume and a newer seek while an earlier conversion is still loading', async () => {
  const video = document.createElement('video')
  let paused = true
  Object.defineProperty(video, 'paused', { get: () => paused })
  vi.spyOn(video, 'play').mockImplementation(async () => { paused = false; video.dispatchEvent(new Event('play')) })
  vi.spyOn(video, 'pause').mockImplementation(() => { paused = true; video.dispatchEvent(new Event('pause')) })
  vi.spyOn(video, 'load').mockImplementation(() => {})
  const pending: Array<{ id: string; position: number; resolve: (value: unknown) => void; reject: (reason: Error) => void }> = []
  const media = vi.fn<DesktopBridge['media']>(async (action, payload) => {
    if (action !== 'start') return { error: null }
    const input = z.object({ id: z.string(), position: z.number() }).parse(payload)
    return new Promise((resolve, reject) => pending.push({ ...input, resolve, reject }))
  })
  const finish = (index: number) => {
    const request = pending[index]
    request.resolve({ id: request.id, url: 'http://127.0.0.1/session/index.m3u8', offset: request.position, duration: 180, mode: 'audio', hasVideo: true, hasAudio: true, audioTracks: [], selectedAudioTrackId: null })
  }
  window.wadiDesktop = {
    getStartFullscreen: async () => false, setStartFullscreen: async value => value, onStartFullscreenChanged: () => () => {}, appVersion: async () => '0.1.0', updateState: async () => ({ kind: 'idle' }), checkUpdates: async () => ({ kind: 'idle' }), downloadUpdate: async () => {}, onUpdate: () => () => {},
    media, onOpenSettings: () => () => {}, openPage: async () => {}, session: async () => true,
    signIn: async () => true, request: async () => ({ status: 200, body: null }), openExternal: async () => {},
  }
  const videoRef = { current: video }
  const { result, rerender, unmount } = renderHook(({ source }) => useDesktopPlayer({ videoRef, source, hints: {}, savedPosition: 0, watched: false, onProgressCommit: () => {} }), { initialProps: { source: 'https://example.com/movie.mkv' } })
  await act(async () => finish(0))
  await waitFor(() => expect(result.current.state.playing).toBe(true))
  await act(() => result.current.seek(90))
  expect(result.current.state).toMatchObject({ status: 'loading', currentTime: 90, duration: 180, playing: true })
  act(() => result.current.toggle())
  expect(result.current.state.playing).toBe(false)
  act(() => result.current.toggle())
  expect(result.current.state.playing).toBe(true)
  expect(pending).toHaveLength(2)
  act(() => result.current.toggle())
  await act(() => result.current.seek(120))
  expect(pending).toHaveLength(3)
  expect(result.current.state).toMatchObject({ status: 'loading', currentTime: 120, playing: false })
  await act(async () => finish(1))
  expect(result.current.state).toMatchObject({ status: 'loading', currentTime: 120, playing: false })
  expect(media).toHaveBeenCalledWith('stop', pending[1].id)
  await act(async () => finish(2))
  await waitFor(() => expect(result.current.state.status).toBe('ready'))
  expect(result.current.state.currentTime).toBe(120)
  expect(result.current.state.playing).toBe(false)
  expect(video.paused).toBe(true)
  await act(() => result.current.play())
  expect(result.current.state.playing).toBe(true)
  await act(() => result.current.seek(150))
  await act(async () => pending[3].reject(new Error('Provider unavailable')))
  expect(result.current.state).toMatchObject({ status: 'error', playing: false, error: 'Provider unavailable' })
  rerender({ source: 'https://example.com/other-movie.mkv' })
  expect(result.current.state).toMatchObject({ status: 'loading', duration: 0, hasAudio: false, audioTracks: [] })
  unmount()
})
