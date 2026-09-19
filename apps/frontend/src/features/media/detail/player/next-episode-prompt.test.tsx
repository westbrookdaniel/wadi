import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NextEpisodePrompt } from './next-episode-prompt'
const episode = { id: 'next', title: 'The Crossing', season: 1, episode: 2 }
afterEach(() => { cleanup(); vi.useRealTimers() })
it('continues once at the end of the countdown', () => {
  vi.useFakeTimers(); const next = vi.fn()
  render(<NextEpisodePrompt episode={episode} seconds={3} onContinue={next} onCancel={() => {}} />)
  act(() => vi.advanceTimersByTime(3000)); expect(next).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(5000)); expect(next).toHaveBeenCalledTimes(1)
})
it('allows immediate playback and clears timers when cancelled/unmounted', () => {
  vi.useFakeTimers(); const next = vi.fn(); const cancel = vi.fn()
  const view = render(<NextEpisodePrompt episode={episode} seconds={10} onContinue={next} onCancel={cancel} />)
  fireEvent.click(screen.getByRole('button', { name: 'Stay here' })); expect(cancel).toHaveBeenCalledOnce()
  view.unmount(); act(() => vi.advanceTimersByTime(15000)); expect(next).not.toHaveBeenCalled()
  render(<NextEpisodePrompt episode={episode} seconds={10} onContinue={next} onCancel={cancel} />)
  fireEvent.click(screen.getByRole('button', { name: 'Play now' })); act(() => vi.advanceTimersByTime(15000)); expect(next).toHaveBeenCalledOnce()
})
