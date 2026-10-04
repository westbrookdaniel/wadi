import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PlayerChrome } from './media-player-page'
import { initialLocalPlaybackState, initialPlayerState } from './state'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

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
    onUseDefaults: vi.fn(), onSubtitleOutlineWidthChange: vi.fn(), onSubtitleOutlineColorChange: vi.fn(), onSubtitleOutlineStyleChange: vi.fn(), onSubtitleFontFamilyChange: vi.fn(),
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

it('opens subtitle preview and exposes an explicit title reset alongside outline weight', () => {
  const input = props()
  render(<TooltipProvider><PlayerChrome {...input} state={{ ...input.state, status: 'ready' }} /></TooltipProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Subtitles' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Subtitle settings' }))
  expect(screen.getByLabelText('Subtitle preview')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Outline weight' }), { target: { value: '3' } })
  expect(input.onSubtitleOutlineWidthChange).toHaveBeenCalledWith(3)
  fireEvent.click(screen.getByRole('button', { name: 'Use device defaults' }))
  expect(input.onUseDefaults).toHaveBeenCalledOnce()
})

it('audio/subtitle menus accept repeated pointer changes and keep keyboard navigation in the menu', () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  const input = props()
  input.state = { ...input.state, status: 'ready', audioTracks: [{ id: 'a', label: 'English audio', language: 'eng' }, { id: 'b', label: 'Spanish audio', language: 'spa' }], selectedAudioTrackId: 'a' }
  input.subtitleTracks = [{ id: 'en', language: 'eng', source: 'Synthetic' }, { id: 'es', language: 'spa', source: 'Synthetic' }]
  input.selectedSubtitleId = 'en'
  const view = render(<TooltipProvider><PlayerChrome {...input} /></TooltipProvider>)
  const audio = screen.getByRole('button', { name: 'Audio track' })
  fireEvent.click(audio)
  expect(screen.getByRole('menu', { name: 'Audio tracks' })).toBeInTheDocument()
  const english = screen.getByRole('menuitemradio', { name: 'English audio' })
  english.focus(); fireEvent.keyDown(english, { key: 'ArrowDown', code: 'ArrowDown' })
  expect(screen.getByRole('menuitemradio', { name: 'Spanish audio' })).toHaveFocus()
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Spanish audio' }))
  expect(input.onSelectAudioTrack).toHaveBeenCalledWith('b')
  expect(audio).toHaveFocus()
  view.rerender(<TooltipProvider><PlayerChrome {...input} state={{ ...input.state, selectedAudioTrackId: 'b' }} /></TooltipProvider>)
  fireEvent.click(audio)
  expect(screen.getByRole('menuitemradio', { name: 'Spanish audio' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(screen.getByRole('menuitem', { name: 'Default audio' }))
  expect(input.onSelectAudioTrack).toHaveBeenLastCalledWith(null)
  const subtitles = screen.getByRole('button', { name: 'Subtitles' })
  fireEvent.click(subtitles)
  fireEvent.click(screen.getByRole('menuitemradio', { name: /Spanish.*Synthetic/ }))
  expect(input.onSelectSubtitle).toHaveBeenCalledWith('es')
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'No subtitles' }))
  expect(input.onSelectSubtitle).toHaveBeenLastCalledWith(null)
  fireEvent.keyDown(screen.getByRole('menu', { name: 'Subtitles' }), { key: 'Escape' })
  expect(subtitles).toHaveFocus()
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(input.onTogglePlay).not.toHaveBeenCalled()
})
