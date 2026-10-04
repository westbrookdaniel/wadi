import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { useAutoPlayback } from '@/store/auto-playback'
import { DetailStreamControls } from './detail-stream-controls'
import { MediaDetailPage } from './index'
import { TvNavigation } from '@/components/tv-navigation'
import { useDeviceStore } from '@/store/device-store'
import type { MediaPreview } from '@/api/types'

const request = vi.fn()
vi.mock('@/api/client', () => ({ apiRequest: (...args: unknown[]) => request(...args), ApiError: class extends Error {} }))
const streams = [{ title: '1080p Synthetic A', url: 'https://example.invalid/a.webm' }, { title: '720p Synthetic B', url: 'https://example.invalid/b.webm' }]
const movie: MediaPreview = { type: 'movie', id: 'film-a', name: 'Synthetic film', description: 'A generated test film', raw: {} }
const series: MediaPreview = { type: 'series', id: 'show-a', name: 'Synthetic show', raw: { videos: [{ id: 'episode-a', title: 'Pilot', season: 1, episode: 1 }, { id: 'episode-b', title: 'Second', season: 1, episode: 2 }] } }
function client() { return new QueryClient({ defaultOptions: { queries: { retry: false } } }) }
const response = (data = streams) => ({ responses: [{ addon_id: 'synthetic', response: { streams: data } }], items: [] })
function api() { request.mockResolvedValue(response()) }
afterEach(() => { cleanup(); request.mockReset(); useAutoPlayback.getState().reset(); useDeviceStore.getState().setTvMode(false); localStorage.clear() })

it.each([false, true])('keeps movie details visible with auto-select=%s until Watch', async enabled => {
  api(); useAutoPlayback.getState().update({ enabled, skipSelection: enabled })
  const play = vi.fn(), back = vi.fn(), qc = client()
  render(<QueryClientProvider client={qc}><MediaDetailPage media={movie} onPlay={play} onBack={back} /></QueryClientProvider>)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Watch' })).toBeEnabled())
  expect(screen.getByLabelText('Synthetic film details')).toBeInTheDocument()
  expect(screen.getByText(movie.description!)).toBeInTheDocument()
  expect(play).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Watch' }))
  expect(play).toHaveBeenCalledOnce()
  expect(play.mock.calls[0][0].url).toBe(streams[0].url)
  expect(play.mock.calls[0][1]).toMatchObject({ mediaId: movie.id, videoId: null })
  await userEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(back).toHaveBeenCalledOnce()
})

it('selects inline without playing, restores focus on Close/Escape, and suppresses repeated Watch', async () => {
  api(); useAutoPlayback.getState().update({ enabled: true, skipSelection: true })
  const play = vi.fn(), qc = client(), user = userEvent.setup()
  render(<QueryClientProvider client={qc}><DetailStreamControls streams={streams} isLoading={false} error={null} onRetry={vi.fn()} onPlay={play} /></QueryClientProvider>)
  await user.click(screen.getByRole('button', { name: 'See streams' }))
  expect(screen.getByRole('button', { name: /Selected.*Synthetic A/ })).toHaveAttribute('aria-pressed', 'true')
  const alternative = screen.getByRole('button', { name: /Synthetic B/ })
  alternative.focus(); await user.keyboard('{Enter}')
  expect(alternative).toHaveAttribute('aria-pressed', 'true')
  expect(play).not.toHaveBeenCalled()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('region', { name: 'Choose stream' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Change stream' })).toHaveFocus()
  await user.click(screen.getByRole('button', { name: 'Change stream' }))
  await user.click(screen.getByRole('button', { name: 'Close streams' }))
  const watch = screen.getByRole('button', { name: 'Watch' })
  watch.focus(); await user.keyboard('{Enter}'); fireEvent.keyDown(watch, { key: 'Enter', repeat: true }); fireEvent.click(watch); fireEvent.click(watch)
  expect(play).toHaveBeenCalledExactlyOnceWith(streams[1])
})

it('handles loading, errors/retry, empty, unmatched, and removed selections without launching', async () => {
  api(); useAutoPlayback.getState().update({ enabled: true, skipSelection: true })
  const play = vi.fn(), retry = vi.fn(), qc = client()
  const page = (data = streams, loading = false, error: Error | null = null) => <QueryClientProvider client={qc}><DetailStreamControls streams={data} isLoading={loading} error={error} onRetry={retry} onPlay={play} /></QueryClientProvider>
  const view = render(page(streams, true))
  expect(screen.getByRole('status')).toHaveTextContent('Loading streams')
  expect(screen.getByRole('button', { name: 'Watch' })).toBeDisabled()
  view.rerender(page(streams, false, new Error('Provider unavailable')))
  expect(screen.getByRole('alert')).toHaveTextContent('Provider unavailable')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(retry).toHaveBeenCalledOnce()
  view.rerender(page([])); expect(screen.getByRole('status')).toHaveTextContent('No streams returned')
  view.rerender(page([{ title: 'Unavailable', url: '' }]))
  expect(screen.getByRole('status')).toHaveTextContent('No stream matches')
  view.rerender(page()); await userEvent.click(screen.getByRole('button', { name: 'See streams' }))
  await userEvent.click(screen.getByRole('button', { name: /Synthetic B/ }))
  view.rerender(page([streams[0]]))
  expect(screen.getByRole('status')).toHaveTextContent('no longer available')
  expect(screen.getByRole('button', { name: 'Watch' })).toBeDisabled()
  expect(play).not.toHaveBeenCalled()
})

it('ignores a late previous-title response and binds Watch to the new movie', async () => {
  let resolveOld!: (value: unknown) => void
  request.mockImplementation((path: string) => path === '/api/streams/movie/film-a' ? new Promise(resolve => { resolveOld = resolve }) : Promise.resolve(response([streams[1]])))
  const play = vi.fn(), qc = client()
  const page = (media: MediaPreview) => <QueryClientProvider client={qc}><MediaDetailPage media={media} onPlay={play} onBack={vi.fn()} /></QueryClientProvider>
  const view = render(page(movie))
  await waitFor(() => expect(resolveOld).toBeDefined())
  view.rerender(page({ ...movie, id: 'film-b', name: 'New film' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Watch' })).toBeEnabled())
  await act(async () => resolveOld(response([streams[0]])))
  await userEvent.click(screen.getByRole('button', { name: 'Watch' }))
  expect(play.mock.calls[0][0].url).toBe(streams[1].url)
  expect(play.mock.calls[0][1].mediaId).toBe('film-b')
})

it('binds choices to episodes and discards late responses and previous manual choices', async () => {
  useAutoPlayback.getState().update({ enabled: true, skipSelection: true })
  let resolveOld!: (value: unknown) => void
  request.mockImplementation((path: string) => path === '/api/streams/series/episode-a' ? new Promise(resolve => { resolveOld = resolve }) : Promise.resolve(response([streams[1]])))
  const play = vi.fn(), qc = client(), user = userEvent.setup()
  render(<QueryClientProvider client={qc}><MediaDetailPage media={series} onPlay={play} onBack={vi.fn()} /></QueryClientProvider>)
  await user.click(screen.getByText('Pilot'))
  await waitFor(() => expect(resolveOld).toBeDefined())
  expect(screen.getByRole('button', { name: 'Watch' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Change Episode' }))
  await user.click(screen.getByText('Second'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Watch' })).toBeEnabled())
  await act(async () => resolveOld(response([streams[0]])))
  expect(play).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'See streams' }))
  await user.click(screen.getByRole('button', { name: /Synthetic B/ }))
  await user.click(screen.getByRole('button', { name: 'Watch' }))
  expect(play.mock.calls[0][1]).toMatchObject({ videoId: 'episode-b', mediaId: 'show-a', episodeContext: { episode: 2 } })
  await user.click(screen.getByRole('button', { name: 'Change Episode' }))
  await user.click(screen.getByText('Pilot'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Watch' })).toBeEnabled())
  expect(screen.getByRole('button', { name: 'See streams' })).toHaveAttribute('aria-expanded', 'false')
  await user.click(screen.getByRole('button', { name: 'Watch' }))
  expect(play.mock.calls[1][0].url).toBe(streams[0].url)
  expect(play.mock.calls[1][1].videoId).toBe('episode-a')
})

it('TV Back closes streams before leaving the detail page', async () => {
  api(); useDeviceStore.getState().setTvMode(true)
  const back = vi.fn(), qc = client()
  render(<QueryClientProvider client={qc}><TvNavigation /><MediaDetailPage media={movie} onBack={back} onPlay={vi.fn()} /></QueryClientProvider>)
  await userEvent.click(screen.getByRole('button', { name: 'See streams' }))
  fireEvent.keyDown(document.activeElement!, { key: 'BrowserBack' })
  expect(screen.queryByRole('region', { name: 'Choose stream' })).not.toBeInTheDocument()
  expect(back).not.toHaveBeenCalled()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(back).toHaveBeenCalledOnce()
})
