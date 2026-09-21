import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { useDeviceStore } from '@/store/device-store'
import { SettingsSelect } from '@/components/ui/settings-select'
import { TvNavigation } from '@/components/tv-navigation'
import { TvPlayerChrome } from './tv-player'
import { initialPlayerState } from '@/features/media/detail/player/state'

beforeEach(() => {
  useDeviceStore.setState({ tvMode: true })
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    const index = [...document.querySelectorAll('button, input')].indexOf(this)
    return new DOMRect(0, index * 80, 150, 60)
  })
})
afterEach(() => { cleanup(); useDeviceStore.setState({ tvMode: false }); vi.restoreAllMocks(); vi.useRealTimers() })

it('never changes a closed picker with arrows, cancels with Back, and restores its trigger', async () => {
  const change = vi.fn()
  render(<><TvNavigation /><SettingsSelect aria-label="Season" value="2" onValueChange={change}><option value="1">Season 1</option><option value="2">Season 2</option></SettingsSelect><button>Next</button></>)
  const trigger = screen.getByRole('button', { name: 'Season' })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  expect(screen.getByText('Next')).toHaveFocus()
  expect(change).not.toHaveBeenCalled()
  expect(document.querySelector('select')).toBeNull()
  fireEvent.click(trigger)
  expect(screen.getByRole('button', { name: /Season 2/ })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(change).not.toHaveBeenCalled()
  expect(trigger).toHaveFocus()
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: 'Season 1' }))
  expect(change).toHaveBeenCalledWith('1')
})

it('edits a controlled field with the in-app keyboard and keeps cancellation transactional', async () => {
  function Form() { const [value, setValue] = useState(''); return <><TvNavigation /><input aria-label="Search" value={value} onChange={event => setValue(event.target.value)} /></> }
  render(<Form />)
  const input = screen.getByRole('textbox', { name: 'Search' })
  input.focus(); fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: 'q' }))
  expect(input).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  await waitFor(() => expect(input).toHaveValue('q'))
  expect(input).toHaveFocus()
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: 'w' }))
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(input).toHaveValue('q')
})

it('restores a route card after loading and does not steal focus on background updates', async () => {
  const view = render(<><TvNavigation /><main data-tv-page="test-home"><button data-tv-focus-key="a">A</button><button data-tv-focus-key="b">B</button></main></>)
  screen.getByText('B').focus()
  view.rerender(<><TvNavigation /><main data-tv-page="test-detail"><button data-tv-default>Play</button></main></>)
  await waitFor(() => expect(screen.getByText('Play')).toHaveFocus())
  view.rerender(<><TvNavigation /><main data-tv-page="test-home"><p data-tv-loading>Loading</p></main></>)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  view.rerender(<><TvNavigation /><main data-tv-page="test-home"><button data-tv-focus-key="a">A</button><button data-tv-focus-key="b">B</button></main></>)
  await waitFor(() => expect(screen.getByText('B')).toHaveFocus())
  screen.getByText('A').focus()
  view.rerender(<><TvNavigation /><main data-tv-page="test-home"><button data-tv-focus-key="a">A</button><button data-tv-focus-key="b">B</button><p>Updated</p></main></>)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  expect(screen.getByText('A')).toHaveFocus()
})

const playerProps = () => ({
  mediaName: 'Sample', state: { ...initialPlayerState, status: 'ready' as const, playing: true, duration: 300, currentTime: 50 }, warning: null,
  hasEpisodeSwapper: false, onBack: vi.fn(), onTogglePlay: vi.fn(), onSeek: vi.fn(), onOpenEpisodeSwapper: vi.fn(), subtitleTracks: [], selectedSubtitleId: null,
  onSelectSubtitle: vi.fn(), onSelectAudioTrack: vi.fn(), playbackSpeed: 1, onPlaybackSpeedChange: vi.fn(), subtitleDelay: 0, onSubtitleDelayChange: vi.fn(), subtitleSize: 1, onSubtitleSizeChange: vi.fn(),
})
it('hides TV controls, seeks explicitly, cancels safely, and has no volume or native controls', () => {
  vi.useFakeTimers()
  const props = playerProps()
  render(<><TvNavigation /><TvPlayerChrome {...props} /></>)
  expect(screen.queryByLabelText(/volume|mute|fullscreen/i)).not.toBeInTheDocument()
  act(() => { vi.advanceTimersByTime(4100) })
  expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
  expect(screen.getByText('1:00')).toBeInTheDocument()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(props.onSeek).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Seek' }))
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' })
  fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
  expect(props.onSeek).toHaveBeenCalledWith(60)
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(props.onBack).not.toHaveBeenCalled()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(props.onBack).toHaveBeenCalledTimes(1)
})

it('waits for a detail entry region to finish loading before focusing its primary action', async () => {
  const view = render(<><TvNavigation /><main data-tv-page="loading-detail"><button>Back</button><section data-tv-entry><p data-tv-loading>Loading streams</p></section></main></>)
  view.rerender(<><TvNavigation /><main data-tv-page="loading-detail"><button>Back</button><section data-tv-entry><button>Filter</button><button data-tv-default>Recommended stream</button></section></main></>)
  await waitFor(() => expect(screen.getByText('Recommended stream')).toHaveFocus())
})

it('requires deliberate entry to adjust a range and exits adjustment when navigating away', () => {
  function Settings() { const [value, setValue] = useState(5); return <><TvNavigation /><input type="range" aria-label="Countdown" min={0} max={10} value={value} onChange={event => setValue(Number(event.target.value))} /><button>After slider</button></> }
  render(<Settings />)
  const slider = screen.getByRole('slider')
  slider.focus()
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(slider).toHaveValue('5')
  fireEvent.keyDown(slider, { key: 'Enter' })
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(slider).toHaveValue('6')
  fireEvent.keyDown(slider, { key: 'ArrowDown' })
  expect(screen.getByText('After slider')).toHaveFocus()
  slider.focus()
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(slider).toHaveValue('6')
})

it('keeps the native desktop select when TV mode is disabled', () => {
  useDeviceStore.setState({ tvMode: false })
  render(<SettingsSelect aria-label="Season" value="1" onValueChange={() => {}}><option value="1">Season 1</option></SettingsSelect>)
  expect(screen.getByRole('combobox', { name: 'Season' }).tagName).toBe('SELECT')
})
