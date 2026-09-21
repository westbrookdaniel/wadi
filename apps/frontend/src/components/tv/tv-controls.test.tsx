import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { useDeviceStore } from '@/store/device-store'
import { SettingsSelect } from '@/components/ui/settings-select'
import { TvNavigation } from '@/components/tv-navigation'
import { TvPlayerChrome } from './tv-player'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
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


it('preserves rich option labels, placeholders and trigger associations in TV selects', () => {
  render(<><TvNavigation /><Select defaultValue="">
    <SelectTrigger id="saved-list" aria-label="Watchlist" aria-describedby="list-help"><SelectValue placeholder="Add to list" /></SelectTrigger>
    <SelectContent><SelectItem value="weekend"><span>Weekend</span><span aria-hidden="true">★</span></SelectItem></SelectContent>
  </Select><p id="list-help">Save for later</p></>)
  const trigger = screen.getByRole('button', { name: 'Watchlist' })
  expect(trigger).toHaveTextContent('Add to list')
  expect(trigger).toHaveAttribute('id', 'saved-list')
  expect(trigger).toHaveAccessibleDescription('Save for later')
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: 'Weekend' }))
  expect(trigger).toHaveTextContent('Weekend')
  expect(trigger).not.toHaveTextContent('[object Object]')
})

it('keeps focus recovery inside an overlay when its focused action disappears', async () => {
  const view = render(<><TvNavigation /><section data-tv-region="background"><button>Background</button></section></>)
  screen.getByText('Background').focus()
  view.rerender(<><TvNavigation /><section data-tv-region="background"><button>Background</button></section><div role="dialog" aria-label="Actions"><button>Remove me</button><button>Stay here</button></div></>)
  screen.getByText('Remove me').focus()
  view.rerender(<><TvNavigation /><section data-tv-region="background"><button>Background</button></section><div role="dialog" aria-label="Actions"><button>Stay here</button></div></>)
  await waitFor(() => expect(screen.getByText('Stay here')).toHaveFocus())
})

it('ignores held OK and Back so one press cannot commit or dismiss multiple player states', () => {
  const props = playerProps()
  render(<><TvNavigation /><TvPlayerChrome {...props} /></>)
  fireEvent.click(screen.getByRole('button', { name: 'Seek' }))
  fireEvent.keyDown(document.activeElement!, { key: 'Enter', repeat: true })
  expect(props.onSeek).not.toHaveBeenCalled()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  fireEvent.keyDown(document.activeElement!, { key: 'Escape', repeat: true })
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  fireEvent.keyDown(document.activeElement!, { key: 'Escape', repeat: true })
  expect(props.onBack).not.toHaveBeenCalled()
})

it('validates numeric constraints without applying a draft and accepts typing on Done', async () => {
  const change = vi.fn()
  render(<><TvNavigation /><input type="number" aria-label="Delay" defaultValue="2" min={1} max={5} step={1} onChange={change} /></>)
  const input = screen.getByRole('spinbutton', { name: 'Delay' })
  fireEvent.click(input)
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  const done = screen.getByRole('button', { name: 'Done' })
  done.focus()
  fireEvent.keyDown(done, { key: '9' })
  fireEvent.click(done)
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(input).toHaveValue(2)
  expect(change).not.toHaveBeenCalled()
  fireEvent.keyDown(done, { key: 'Backspace' })
  fireEvent.keyDown(done, { key: '3' })
  fireEvent.click(done)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByRole('spinbutton', { name: 'Delay' })).toHaveValue(3)
  expect(change).toHaveBeenCalledTimes(1)
})

it('finishes slider adjustment before dismissing its parent dialog', async () => {
  function Modal() {
    const [open, setOpen] = useState(true)
    return <><TvNavigation /><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Preferences</DialogTitle><DialogDescription>Adjust settings</DialogDescription><input type="range" aria-label="Countdown" defaultValue={5} min={0} max={10} /></DialogContent></Dialog></>
  }
  render(<Modal />)
  const slider = screen.getByRole('slider')
  slider.focus()
  fireEvent.keyDown(slider, { key: 'Enter' })
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(slider).toHaveValue('6')
  fireEvent.keyDown(slider, { key: 'Escape' })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.keyDown(slider, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('gives playback controls a fresh idle timeout after closing a picker', async () => {
  vi.useFakeTimers()
  render(<><TvNavigation /><TvPlayerChrome {...playerProps()} /></>)
  fireEvent.click(screen.getByRole('button', { name: 'Playback speed' }))
  act(() => { vi.advanceTimersByTime(7900) })
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  await act(async () => { vi.advanceTimersByTime(0) })
  act(() => { vi.advanceTimersByTime(200) })
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  act(() => { vi.advanceTimersByTime(4000) })
  expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()
})

it('keeps a skip action visible after auto-hide and supports remote activation', () => {
  vi.useFakeTimers()
  const props = playerProps()
  const view = render(<TvPlayerChrome {...props} />)
  act(() => { vi.advanceTimersByTime(4100) })
  view.rerender(<TvPlayerChrome {...props} skipSegment={{ type: 'recap', start: 40, end: 80 }} />)
  const skip = screen.getByRole('button', { name: 'Skip recap' })
  skip.focus()
  fireEvent.keyDown(skip, { key: 'Enter' })
  expect(props.onSeek).toHaveBeenCalledWith(80)
  expect(props.onTogglePlay).not.toHaveBeenCalled()
})

it('lets Back hide a pinned skip prompt before leaving playback', () => {
  const props = playerProps()
  render(<TvPlayerChrome {...props} skipSegment={{ type: 'outro', start: 40, end: 80 }} />)
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('button', { name: 'Skip outro' })).not.toBeInTheDocument()
  expect(props.onBack).not.toHaveBeenCalled()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(props.onBack).toHaveBeenCalledOnce()
})


it('offers a dismissed skip again after leaving and seeking back into its segment', () => {
  const props = playerProps()
  const segment = { type: 'intro' as const, start: 40, end: 80 }
  const view = render(<TvPlayerChrome {...props} skipSegment={segment} />)
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('button', { name: 'Skip intro' })).not.toBeInTheDocument()
  view.rerender(<TvPlayerChrome {...props} />)
  view.rerender(<TvPlayerChrome {...props} skipSegment={segment} />)
  expect(screen.getByRole('button', { name: 'Skip intro' })).toBeInTheDocument()
})
