import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { useAutoPlayback } from '@/store/auto-playback'
import { AutoPlaybackSettings } from './auto-playback-settings'

function showSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  client.setQueryData(['addons'], [])
  return render(<QueryClientProvider client={client}><AutoPlaybackSettings /></QueryClientProvider>)
}
afterEach(() => { cleanup(); useAutoPlayback.getState().reset() })
it('stages checkbox and slider edits until Save changes, then persists them together', () => {
  showSettings()
  const save = screen.getByRole('button', { name: 'Save changes' })
  expect(save).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: /^Recommend a stream/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /^Skip stream selection/ }))
  fireEvent.change(screen.getByRole('slider', { name: /^Countdown/ }), { target: { value: '20' } })
  expect(useAutoPlayback.getState().settings.enabled).toBe(false)
  expect(useAutoPlayback.getState().settings.countdownSeconds).toBe(10)
  expect(save).toBeEnabled()
  fireEvent.click(save)
  expect(useAutoPlayback.getState().settings).toMatchObject({ enabled: true, skipSelection: true, countdownSeconds: 20 })
  expect(save).toBeDisabled()
})
it('discards unsaved edits on leaving and preserves saved preferences on returning', () => {
  useAutoPlayback.getState().update({ preferredResolution: 720 })
  const view = showSettings()
  fireEvent.click(screen.getByRole('checkbox', { name: /^Recommend a stream/ }))
  view.unmount()
  showSettings()
  expect(screen.getByRole('checkbox', { name: /^Recommend a stream/ })).not.toBeChecked()
  expect(screen.getByRole('combobox', { name: 'Preferred resolution' })).toHaveValue('720')
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
})
it('requires a cached marker and saves the chosen mode only on confirmation', () => {
  showSettings()
  fireEvent.click(screen.getByRole('checkbox', { name: /^Recommend a stream/ }))
  fireEvent.change(screen.getByRole('combobox', { name: 'Cached streams' }), { target: { value: 'only' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Cached indicator' }), { target: { value: ' ' } })
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  fireEvent.change(screen.getByRole('textbox', { name: 'Cached indicator' }), { target: { value: '⚡' } })
  expect(useAutoPlayback.getState().settings.cachedMode).toBe('any')
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(useAutoPlayback.getState().settings).toMatchObject({ cachedMode: 'only', cachedIndicator: '⚡' })
})
it('allows disabling auto-pick even after clearing an unfinished cached rule', () => {
  useAutoPlayback.getState().update({ enabled: true, cachedMode: 'only' })
  showSettings()
  fireEvent.change(screen.getByRole('textbox', { name: 'Cached indicator' }), { target: { value: '' } })
  fireEvent.click(screen.getByRole('checkbox', { name: /^Recommend a stream/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(useAutoPlayback.getState().settings.enabled).toBe(false)
})

it('saves timing rules independently of auto-pick', () => {
  showSettings()
  fireEvent.change(screen.getByRole('slider', { name: /^Start countdown before/ }), { target: { value: '120' } })
  fireEvent.change(screen.getByRole('slider', { name: /^Count as started/ }), { target: { value: '15' } })
  fireEvent.change(screen.getByRole('slider', { name: /^Count as finished/ }), { target: { value: '90' } })
  expect(useAutoPlayback.getState().settings.nextEpisodeLeadSeconds).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(useAutoPlayback.getState().settings).toMatchObject({ enabled: false, nextEpisodeLeadSeconds: 120, ignoreStartSeconds: 15, finishRemainingSeconds: 90 })
})
