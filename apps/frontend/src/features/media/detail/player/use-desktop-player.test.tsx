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
    updateState: async () => ({ kind: 'idle' }), checkUpdates: async () => ({ kind: 'idle' }), installUpdate: async () => {}, updatePlayback: async () => {}, onUpdate: () => () => {},
    media, onOpenSettings: () => () => {}, openPage: async () => {}, session: async () => true,
    signIn: async () => true, request: async () => ({ status: 200, body: null }), openExternal: async () => {},
  }
  const videoRef = { current: video }
  const { result, unmount } = renderHook(() => useDesktopPlayer({ videoRef, source: 'https://example.com/movie.mkv', hints: {}, savedPosition: 0, watched: false, onProgressCommit: () => {} }))
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
  unmount()
  expect(media.mock.calls.filter(([action]) => action === 'stop')).toHaveLength(2)
})
