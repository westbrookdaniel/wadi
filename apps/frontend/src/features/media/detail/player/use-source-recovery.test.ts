import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { initialPlayerState } from './state'
import { useSourceRecovery } from './use-source-recovery'

const sources = ['a', 'b', 'c', 'd'].map(name => ({ url: `https://example.test/${name}` }))
const base = (): Parameters<typeof useSourceRecovery>[0] => ({
  episodeKey: 'episode', source: sources[0],
  state: { ...initialPlayerState, status: 'ready', duration: 1000, currentTime: 42, playing: true, sourceUrl: sources[0].url },
  candidates: sources, enabled: true, attempts: 2, timeoutSeconds: 10, savedPosition: 0,
  onSwitch: vi.fn(), onFailure: vi.fn(),
})
afterEach(() => vi.useRealTimers())

it('preserves a rewind to zero and pause state, ignores stale errors, and bounds retries', () => {
  const input = base()
  const hook = renderHook(props => useSourceRecovery(props), { initialProps: input })
  const paused = { ...input.state, currentTime: 0, playing: false }
  hook.rerender({ ...input, state: paused })
  hook.rerender({ ...input, state: { ...paused, status: 'error', currentTime: 0 } })
  expect(input.onSwitch).toHaveBeenLastCalledWith(sources[1], 0, false)
  // The old decoder's error must not consume another attempt after switching.
  hook.rerender({ ...input, source: sources[1], state: { ...paused, status: 'error' } })
  expect(input.onSwitch).toHaveBeenCalledTimes(1)
  hook.rerender({ ...input, source: sources[1], state: { ...paused, status: 'loading', sourceUrl: sources[1].url } })
  hook.rerender({ ...input, source: sources[1], state: { ...paused, status: 'error', sourceUrl: sources[1].url } })
  expect(input.onSwitch).toHaveBeenLastCalledWith(sources[2], 0, false)
  hook.rerender({ ...input, source: sources[2], state: { ...paused, status: 'loading', sourceUrl: sources[2].url } })
  hook.rerender({ ...input, source: sources[2], state: { ...paused, status: 'error', sourceUrl: sources[2].url } })
  expect(input.onSwitch).toHaveBeenCalledTimes(2)
  expect(hook.result.current.exhausted).toBe(true)
})

it('times out startup once, cancels timers on unmount, and leaves established seeks alone', () => {
  vi.useFakeTimers()
  const input = base()
  const hook = renderHook(props => useSourceRecovery(props), { initialProps: { ...input, state: { ...input.state, status: 'loading' as const, duration: 0 } } })
  act(() => vi.advanceTimersByTime(10000))
  expect(input.onSwitch).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(10000))
  expect(input.onSwitch).toHaveBeenCalledTimes(1)
  hook.unmount()
  act(() => vi.advanceTimersByTime(10000))
  expect(input.onSwitch).toHaveBeenCalledTimes(1)
  const seek = renderHook(() => useSourceRecovery({ ...input, state: { ...input.state, status: 'loading', duration: 1000 } }))
  act(() => vi.advanceTimersByTime(20000))
  expect(input.onSwitch).toHaveBeenCalledTimes(1)
  seek.unmount()
})

it('never retries the same URL, supports manual recovery when disabled, and resets for the next episode', () => {
  const input = base()
  const hook = renderHook(props => useSourceRecovery(props), { initialProps: { ...input, enabled: false } })
  act(() => { hook.result.current.tryAnother() })
  expect(input.onSwitch).toHaveBeenLastCalledWith(sources[1], 42, true)
  hook.rerender({ ...input, enabled: false, source: sources[1], state: { ...input.state, sourceUrl: sources[1].url, status: 'loading' } })
  act(() => { hook.result.current.tryAnother() })
  expect(input.onSwitch).toHaveBeenLastCalledWith(sources[2], 42, true)
  hook.rerender({ ...input, enabled: false, episodeKey: 'next', state: { ...input.state, currentTime: 0 } })
  act(() => { hook.result.current.tryAnother() })
  expect(input.onSwitch).toHaveBeenLastCalledWith(sources[1], 0, true)
})
