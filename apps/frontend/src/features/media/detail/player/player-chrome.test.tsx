import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PlayerChrome } from './media-player-page'
import { initialLocalPlaybackState, initialPlayerState } from './state'

afterEach(() => vi.useRealTimers())

function props(): ComponentProps<typeof PlayerChrome> {
  return {
    ...initialLocalPlaybackState,
    playerRef: { current: null }, mediaName: 'Test film',
    state: { ...initialPlayerState, status: 'loading', duration: 180, currentTime: 90, playing: true, hasAudio: true },
    warning: null, episodeContext: null, hasEpisodeSwapper: true, forceVisible: false,
    subtitleTracks: [], castReady: false, castConnected: false, castUnavailableReason: null,
    onOpenEpisodeSwapper: vi.fn(), onSelectSubtitle: vi.fn(), onSubtitleDelayChange: vi.fn(),
    onSubtitleSizeChange: vi.fn(), onSubtitlePositionChange: vi.fn(), onSubtitleTextColorChange: vi.fn(),
    onSubtitleBackgroundColorChange: vi.fn(), onSubtitleBackgroundOpacityChange: vi.fn(),
    onSubtitleOutlineColorChange: vi.fn(), onSubtitleOutlineStyleChange: vi.fn(), onSubtitleFontFamilyChange: vi.fn(),
    onSubtitleOffsetXChange: vi.fn(), onSubtitleOffsetYChange: vi.fn(), onPlaybackSpeedChange: vi.fn(),
    onCastToggle: vi.fn(), onBack: vi.fn(), onTogglePlay: vi.fn(), onSeek: vi.fn(),
    onVolumeChange: vi.fn(), onToggleMute: vi.fn(), onSelectAudioTrack: vi.fn(),
  }
}

it('keeps controls pinned and interactive while rebuilding the stream after a seek', () => {
  const input = props()
  const { container, rerender } = render(<TooltipProvider><PlayerChrome {...input} /></TooltipProvider>)
  expect(container.querySelector('.player-chrome')).toHaveAttribute('data-visible', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
  expect(input.onTogglePlay).toHaveBeenCalledOnce()
  const seek = screen.getByRole('slider', { name: 'Seek Test film' })
  expect(seek).toHaveAttribute('aria-disabled', 'false')
  fireEvent.keyDown(seek, { key: 'ArrowRight' })
  expect(input.onSeek).toHaveBeenCalledWith(95)
  fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
  expect(input.onToggleMute).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Choose episode' }))
  expect(input.onOpenEpisodeSwapper).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(input.onBack).toHaveBeenCalledOnce()
  rerender(<TooltipProvider><PlayerChrome {...input} state={{ ...input.state, status: 'ready' }} /></TooltipProvider>)
  expect(container.querySelector('.player-chrome')).toHaveAttribute('data-visible', 'false')
})

it('keeps navigation visible on initial load but waits for metadata before enabling playback', () => {
  const input = props()
  render(<TooltipProvider><PlayerChrome {...input} state={{ ...initialPlayerState, status: 'loading' }} /></TooltipProvider>)
  expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
  expect(screen.getByRole('slider', { name: 'Seek Test film' })).toHaveAttribute('aria-disabled', 'true')
})

it('shows skip controls independently and seeks to the segment end without toggling playback', () => {
  const input = props()
  const view = render(<TooltipProvider><PlayerChrome {...input} state={{ ...input.state, status: 'ready' }} skipSegment={{ type: 'intro', start: 0, end: 95 }} /></TooltipProvider>)
  expect(view.container.querySelector('.player-chrome')).toHaveAttribute('data-visible', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Skip intro' }))
  expect(input.onSeek).toHaveBeenCalledWith(95)
  expect(input.onTogglePlay).not.toHaveBeenCalled()
  view.rerender(<TooltipProvider><PlayerChrome {...input} /></TooltipProvider>)
  expect(screen.queryByRole('button', { name: 'Skip intro' })).not.toBeInTheDocument()
})


it('dismisses without seeking and expires after ten seconds despite equivalent rerenders', () => {
  vi.useFakeTimers()
  const input = { ...props(), state: { ...props().state, status: 'ready' as const } }
  const segment = { type: 'intro' as const, start: 0, end: 95 }
  const view = render(<TooltipProvider><PlayerChrome {...input} skipSegment={segment} /></TooltipProvider>)
  expect(screen.getByRole('group', { name: 'Skip segment' }).closest('.player-chrome')).toBeNull()
  act(() => vi.advanceTimersByTime(9000))
  view.rerender(<TooltipProvider><PlayerChrome {...input} skipSegment={{ ...segment }} /></TooltipProvider>)
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(1000))
  expect(screen.queryByRole('button', { name: 'Skip intro' })).not.toBeInTheDocument()
  view.rerender(<TooltipProvider><PlayerChrome {...input} /></TooltipProvider>)
  view.rerender(<TooltipProvider><PlayerChrome {...input} skipSegment={segment} /></TooltipProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(input.onSeek).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Skip intro' })).not.toBeInTheDocument()
})
