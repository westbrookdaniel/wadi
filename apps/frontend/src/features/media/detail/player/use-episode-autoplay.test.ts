import { act, renderHook, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useEpisodeAutoplay } from './use-episode-autoplay'

afterEach(cleanup)
it('prompts at the credits boundary only once even after cancellation, seeking or ended', () => {
  const onPrompt = vi.fn()
  const props = { episodeKey: 'silo:1', enabled: true, playing: true, currentTime: 3479, duration: 3600, leadSeconds: 120, onPrompt }
  const { result, rerender } = renderHook(useEpisodeAutoplay, { initialProps: props })
  expect(onPrompt).not.toHaveBeenCalled()
  rerender({ ...props, currentTime: 3480 })
  expect(onPrompt).toHaveBeenCalledTimes(1)
  rerender({ ...props, currentTime: 2000 })
  rerender({ ...props, currentTime: 3600 })
  act(() => result.current())
  expect(onPrompt).toHaveBeenCalledTimes(1)
  rerender({ ...props, episodeKey: 'silo:2', currentTime: 3480 })
  expect(onPrompt).toHaveBeenCalledTimes(1)
  rerender({ ...props, episodeKey: 'silo:2', currentTime: 0 })
  rerender({ ...props, episodeKey: 'silo:2', currentTime: 3480 })
  expect(onPrompt).toHaveBeenCalledTimes(2)
})
it('waits for playback, skips unknown duration, and protects short episodes', () => {
  const onPrompt = vi.fn()
  const props = { episodeKey: 'short', enabled: true, playing: false, currentTime: 29, duration: 60, leadSeconds: 120, onPrompt }
  const { rerender } = renderHook(useEpisodeAutoplay, { initialProps: props })
  rerender({ ...props, playing: true })
  rerender({ ...props, playing: true, duration: Infinity, currentTime: 30 })
  rerender({ ...props, playing: false, currentTime: 30 })
  expect(onPrompt).not.toHaveBeenCalled()
  rerender({ ...props, playing: true, currentTime: 30 })
  expect(onPrompt).toHaveBeenCalledTimes(1)
})
it('preserves end-only defaults and respects eligibility', () => {
  const onPrompt = vi.fn()
  const props = { episodeKey: 'silo:1', enabled: false, playing: true, currentTime: 3600, duration: 3600, leadSeconds: 0, onPrompt }
  const { result, rerender } = renderHook(useEpisodeAutoplay, { initialProps: props })
  act(() => result.current())
  rerender({ ...props, enabled: true })
  expect(onPrompt).not.toHaveBeenCalled()
  act(() => result.current())
  expect(onPrompt).toHaveBeenCalledTimes(1)
})
