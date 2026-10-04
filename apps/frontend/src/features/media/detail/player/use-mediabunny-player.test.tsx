import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useMediabunnyPlayer } from './use-mediabunny-player'
const fixture = vi.hoisted(() => ({ inputs: 0, sinks: [] as string[], tracks: [{ id: 1, languageCode: 'eng', name: '440 Hz', sampleRate: 48000, codec: 'opus', canDecode: async () => true }, { id: 2, languageCode: 'jpn', name: '880 Hz', sampleRate: 48000, codec: 'opus', canDecode: async () => true }] }))
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [], UrlSource: class {}, CanvasSink: class {},
  Input: class { constructor() { fixture.inputs++ } computeDuration = async () => 120; getPrimaryVideoTrack = async () => null; getAudioTracks = async () => fixture.tracks; dispose() {} },
  AudioBufferSink: class { constructor(track: { id: number }) { fixture.sinks.push(String(track.id)) } async *buffers() {} },
}))
class AudioContextFixture {
  static instances: AudioContextFixture[] = []
  currentTime = 0; state = 'suspended'; destination = {}; resume = vi.fn(async () => { this.state = 'running' }); close = vi.fn(async () => {})
  constructor() { AudioContextFixture.instances.push(this) }
  createGain() { return { connect() {}, gain: { value: 1, setValueAtTime() {} } } }
}
afterEach(() => { vi.unstubAllGlobals(); fixture.inputs = 0; fixture.sinks = []; AudioContextFixture.instances = [] })
function renderPlayer() {
  vi.stubGlobal('AudioContext', AudioContextFixture)
  vi.stubGlobal('requestAnimationFrame', () => 1); vi.stubGlobal('cancelAnimationFrame', () => {})
  const canvasRef = { current: null }
  return renderHook(() => useMediabunnyPlayer({ canvasRef, url: 'https://example.invalid/multitrack.webm', authToken: null, savedPosition: 60, watched: false, preferredAudioLanguage: null, selectedAudioTrackId: null, initialPlaybackSpeed: 1, onProgressCommit: vi.fn() }))
}
it('changes the actual audio sink without reloading source or losing paused position, volume/mute/speed', async () => {
  const view = renderPlayer()
  await waitFor(() => expect(view.result.current.state.status).toBe('ready'))
  await act(async () => { view.result.current.seek(75); view.result.current.setVolume(0.3); view.result.current.toggleMute(); view.result.current.setPlaybackSpeed(1.25) })
  await act(async () => view.result.current.setAudioTrack('2'))
  expect(fixture.sinks).toEqual(['1', '2'])
  expect(fixture.inputs).toBe(1)
  expect(view.result.current.state).toMatchObject({ selectedAudioTrackId: '2', currentTime: 75, playing: false, volume: 0.3, muted: true, playbackSpeed: 1.25 })
  await act(async () => view.result.current.setAudioTrack(null))
  expect(fixture.sinks.at(-1)).toBe('1')
  expect(view.result.current.state.currentTime).toBe(75)
})
it('keeps intended playback through rapid switches while resume is pending', async () => {
  const view = renderPlayer()
  await waitFor(() => expect(view.result.current.state.status).toBe('ready'))
  await act(async () => view.result.current.play())
  const context = AudioContextFixture.instances[0]
  context.state = 'suspended'
  const resumes: Array<() => void> = []
  context.resume.mockImplementation(() => new Promise<void>(resolve => resumes.push(resolve)))
  let first!: Promise<void>, second!: Promise<void>
  await act(async () => { first = view.result.current.setAudioTrack('2') })
  await waitFor(() => expect(resumes.length).toBe(1))
  await act(async () => { second = view.result.current.setAudioTrack('1') })
  await waitFor(() => expect(resumes.length).toBe(2))
  await act(async () => { resumes.forEach(resolve => resolve()); await Promise.all([first, second]) })
  expect(view.result.current.state).toMatchObject({ selectedAudioTrackId: '1', playing: true, currentTime: 60 })
  expect(fixture.inputs).toBe(1)
})
