import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useMediabunnyPlayer } from './use-mediabunny-player'

const mocks = vi.hoisted(() => ({ reads: [] as Array<PromiseWithResolvers<void>>, disposed: vi.fn(), resume: vi.fn(), close: vi.fn(), inputs: 0, audioReads: [] as Array<PromiseWithResolvers<void>>, audio: false, pacing: false, audioNext: vi.fn() }))
vi.mock('mediabunny', () => ({
  ALL_FORMATS: [], UrlSource: class {},
  AudioBufferSink: class {
    buffers() {
      return {
        next: async () => {
          mocks.audioNext()
          if (mocks.pacing) return { done: false, value: { timestamp: 62, buffer: {} } }
          const read = Promise.withResolvers<void>(); mocks.audioReads.push(read)
          await read.promise
          if (mocks.disposed.mock.calls.length) throw new Error('InputDisposedError: disposed during audio read')
          return { done: true, value: undefined }
        },
        // Mediabunny's mapped iterator return does not await an outstanding next.
        return: async () => ({ done: true, value: undefined }),
        [Symbol.asyncIterator]() { return this },
      }
    }
  },
  Input: class {
    constructor() { mocks.inputs++ }
    computeDuration = async () => 120
    getAudioTracks = async () => mocks.audio ? [{ id: 1, languageCode: "eng", sampleRate: 48000, codec: "opus", canDecode: async () => true }] : []
    getPrimaryVideoTrack = async () => ({ codec: 'vp9', displayWidth: 320, displayHeight: 180, canDecode: async () => true, canBeTransparent: async () => false })
    dispose = mocks.disposed
  },
  CanvasSink: class {
    async *canvases() {
      const read = Promise.withResolvers<void>()
      mocks.reads.push(read)
      await read.promise
      if (mocks.disposed.mock.calls.length) throw new Error('InputDisposedError: input was disposed during read')
      yield { timestamp: 60, canvas: {} }
      yield { timestamp: 61, canvas: {} }
    }
  },
}))
beforeEach(() => {
  mocks.reads = []; mocks.inputs = 0; mocks.audioReads = []; mocks.audio = false; mocks.pacing = false
  mocks.resume.mockResolvedValue(undefined); mocks.close.mockResolvedValue(undefined)
  vi.stubGlobal('AudioContext', class {
    state = 'suspended'; currentTime = 0; destination = {}
    createGain() { return { gain: { value: 0 }, connect() {} } }
    createBufferSource() { return { playbackRate: { value: 1 }, connect() {}, start() {}, stop() {} } }
    resume = mocks.resume; close = mocks.close
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks() })
function mount() {
  const onProgressCommit = vi.fn()
  const options = { canvasRef: { current: null }, url: '/fixture.webm', authToken: null, savedPosition: 60, watched: false, preferredAudioLanguage: null, selectedAudioTrackId: null, initialPlaybackSpeed: 1, onProgressCommit }
  return { ...renderHook(() => useMediabunnyPlayer(options)), onProgressCommit }
}
async function ready(hook: ReturnType<typeof mount>) {
  await waitFor(() => expect(mocks.reads).toHaveLength(1))
  await act(async () => mocks.reads[0].resolve())
  await waitFor(() => expect(hook.result.current.state.status).toBe('ready'))
}
it('enables controls only after initial frames and starts with the first toggle', async () => {
  const hook = mount()
  await waitFor(() => expect(mocks.reads).toHaveLength(1))
  expect(hook.result.current.state.status).toBe('loading')
  await ready(hook)
  await act(async () => hook.result.current.toggle())
  expect(hook.result.current.state.playing).toBe(true)
  expect(mocks.resume).toHaveBeenCalledTimes(1)
  expect(mocks.inputs).toBe(1)
  hook.unmount()
})
it('drains a pending initial frame read before disposing on Back', async () => {
  const hook = mount()
  await waitFor(() => expect(mocks.reads).toHaveLength(1))
  hook.unmount()
  expect(mocks.disposed).not.toHaveBeenCalled()
  await act(async () => mocks.reads[0].resolve())
  await waitFor(() => expect(mocks.disposed).toHaveBeenCalledTimes(1))
  expect(hook.onProgressCommit).not.toHaveBeenCalled()
})
it('drains a pending rewind before disposing and does not commit it after Back', async () => {
  const hook = mount()
  await ready(hook)
  let seeking: Promise<void>
  act(() => { seeking = hook.result.current.seek(20, true) })
  await waitFor(() => expect(mocks.reads).toHaveLength(2))
  hook.unmount()
  expect(mocks.disposed).not.toHaveBeenCalled()
  const count = hook.onProgressCommit.mock.calls.length
  await act(async () => { mocks.reads[1].resolve(); await seeking })
  await waitFor(() => expect(mocks.disposed).toHaveBeenCalledTimes(1))
  expect(hook.onProgressCommit).toHaveBeenCalledTimes(count)
})
it('cannot restart playback after Pause while AudioContext resume is pending', async () => {
  const hook = mount(); await ready(hook)
  const resume = Promise.withResolvers<void>(); mocks.resume.mockReturnValueOnce(resume.promise)
  let playing: Promise<void>
  act(() => { playing = hook.result.current.play() })
  act(() => hook.result.current.pause())
  await act(async () => { resume.resolve(); await playing })
  expect(hook.result.current.state.playing).toBe(false)
  hook.unmount()
})
it('cannot restart a disposed session when AudioContext resume finishes', async () => {
  const hook = mount(); await ready(hook)
  const resume = Promise.withResolvers<void>(); mocks.resume.mockReturnValueOnce(resume.promise)
  let playing: Promise<void>
  act(() => { playing = hook.result.current.play() })
  hook.unmount()
  await act(async () => { resume.resolve(); await playing })
  expect(hook.result.current.state.playing).toBe(false)
  await waitFor(() => expect(mocks.close).toHaveBeenCalledTimes(1))
})
it('reports a real decoder failure instead of hiding it as cancellation', async () => {
  const report = vi.spyOn(console, 'error').mockImplementation(() => {})
  const hook = mount()
  try {
    await waitFor(() => expect(mocks.reads).toHaveLength(1))
    const error = new Error('decoder failed')
    await act(async () => mocks.reads[0].reject(error))
    await waitFor(() => expect(hook.result.current.state.status).toBe('error'))
    expect(hook.result.current.state.error).toBe('decoder failed')
    expect(report).toHaveBeenCalledWith(error)
  } finally { hook.unmount(); report.mockRestore() }
})

it('keeps input alive until a pending audio read settles after iterator return on Back', async () => {
  mocks.audio = true
  const hook = mount(); await ready(hook)
  await act(async () => hook.result.current.play())
  await waitFor(() => expect(mocks.audioReads).toHaveLength(1))
  hook.unmount()
  await act(async () => { await Promise.resolve() })
  expect(mocks.disposed).not.toHaveBeenCalled()
  await act(async () => mocks.audioReads[0].resolve())
  await waitFor(() => expect(mocks.disposed).toHaveBeenCalledTimes(1))
})

it('cancels a paced audio consumer before its next read and then disposes on Back', async () => {
  mocks.audio = true; mocks.pacing = true
  const hook = mount(); await ready(hook)
  vi.useFakeTimers()
  await act(async () => hook.result.current.play())
  expect(mocks.audioNext).toHaveBeenCalledTimes(1)
  hook.unmount()
  await act(async () => { await Promise.resolve() })
  expect(mocks.disposed).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTimeAsync(100))
  expect(mocks.audioNext).toHaveBeenCalledTimes(1)
  expect(mocks.disposed).toHaveBeenCalledTimes(1)
})
