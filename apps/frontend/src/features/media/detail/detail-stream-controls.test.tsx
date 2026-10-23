import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
const response = (data = streams) => ({ responses: [{ addon_id: 'synthetic', response: { streams: data } }], items: [{ id: 'synthetic', manifest: { name: 'Synthetic', resources: ['stream'], types: ['movie', 'series'] } }] })
afterEach(() => { cleanup(); request.mockReset(); useAutoPlayback.getState().reset(); useDeviceStore.getState().setTvMode(false); localStorage.clear(); vi.restoreAllMocks() })

it.each([[false, false], [true, false], [true, true]])('keeps movie details with auto-select=%s and legacy skip=%s until a stream is clicked', async (enabled, skipSelection) => {
  request.mockResolvedValue(response()); useAutoPlayback.getState().update({ enabled, skipSelection })
  const play = vi.fn(), back = vi.fn()
  render(<QueryClientProvider client={client()}><MediaDetailPage media={movie} onPlay={play} onBack={back} /></QueryClientProvider>)
  expect(screen.getByLabelText('Synthetic film details')).toBeInTheDocument()
  expect(screen.getByText(movie.description!)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Watch' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'See streams' })).not.toBeInTheDocument()
  const stream = await screen.findByRole('button', { name: /Synthetic B/ })
  expect(play).not.toHaveBeenCalled()
  stream.focus(); await userEvent.keyboard('{Enter}')
  expect(play).toHaveBeenCalledOnce()
  expect(play.mock.calls[0][0].url).toBe(streams[1].url)
  expect(play.mock.calls[0][1]).toMatchObject({ mediaId: movie.id, videoId: null })
  await userEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(back).toHaveBeenCalledOnce()
})

it('handles loading, errors/retry, empty and unavailable streams without launching', async () => {
  const play = vi.fn(), retry = vi.fn(), qc = client()
  const page = (data = streams, loading = false, error: Error | null = null) => <QueryClientProvider client={qc}><DetailStreamControls streams={data} isLoading={loading} error={error} onRetry={retry} onPlay={play} /></QueryClientProvider>
  const view = render(page(streams, true))
  expect(screen.getByRole('button', { name: /Synthetic A/ })).toBeEnabled()
  expect(screen.getByRole('button', { name: /Synthetic A/ })).toBeEnabled()
  view.rerender(page(streams, false, new Error('Provider unavailable')))
  expect(screen.getByRole('alert')).toHaveTextContent('Provider unavailable')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(retry).toHaveBeenCalledOnce()
  view.rerender(page([])); expect(screen.getByText('No streams returned.')).toBeInTheDocument()
  view.rerender(page([{ title: 'Broken source', url: '' }]))
  const broken = screen.getByRole('button', { name: /Broken source/ })
  expect(broken).toBeDisabled(); await userEvent.click(broken)
  expect(play).not.toHaveBeenCalled()
})

it('ignores a late previous-title response and plays the new movie stream', async () => {
  let resolveOld!: (value: unknown) => void
  request.mockImplementation((path: string) => path.startsWith('/api/streams/movie/film-a') ? new Promise(resolve => { resolveOld = resolve }) : Promise.resolve(response([streams[1]])))
  const play = vi.fn(), qc = client()
  const page = (media: MediaPreview) => <QueryClientProvider client={qc}><MediaDetailPage media={media} onPlay={play} onBack={vi.fn()} /></QueryClientProvider>
  const view = render(page(movie))
  await waitFor(() => expect(resolveOld).toBeDefined())
  view.rerender(page({ ...movie, id: 'film-b', name: 'New film' }))
  await act(async () => resolveOld(response([streams[0]])))
  await userEvent.click(await screen.findByRole('button', { name: /Synthetic B/ }))
  expect(screen.queryByRole('button', { name: /Synthetic A/ })).not.toBeInTheDocument()
  expect(play.mock.calls[0][0].url).toBe(streams[1].url)
  expect(play.mock.calls[0][1].mediaId).toBe('film-b')
})

it('binds streams to episodes and discards late responses', async () => {
  let resolveOld!: (value: unknown) => void
  request.mockImplementation((path: string) => path.startsWith('/api/streams/series/episode-a') ? new Promise(resolve => { resolveOld = resolve }) : Promise.resolve(response([streams[1]])))
  const play = vi.fn(), user = userEvent.setup()
  render(<QueryClientProvider client={client()}><MediaDetailPage media={series} onPlay={play} onBack={vi.fn()} /></QueryClientProvider>)
  await user.click(screen.getByText('Pilot')); await waitFor(() => expect(resolveOld).toBeDefined())
  await user.click(within(screen.getByLabelText('Available streams')).getByRole('button', { name: 'Back' })); await user.click(screen.getByText('Second'))
  await act(async () => resolveOld(response([streams[0]])))
  await user.click(await screen.findByRole('button', { name: /Synthetic B/ }))
  expect(screen.queryByRole('button', { name: /Synthetic A/ })).not.toBeInTheDocument()
  expect(play.mock.calls[0][1]).toMatchObject({ videoId: 'episode-b', mediaId: 'show-a', episodeContext: { episode: 2 } })
})

it('TV Back returns from visible movie streams to browsing', async () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => ({ length: 1 } as DOMRectList))
  request.mockResolvedValue(response()); useDeviceStore.getState().setTvMode(true)
  const back = vi.fn()
  render(<QueryClientProvider client={client()}><TvNavigation /><MediaDetailPage media={movie} onBack={back} onPlay={vi.fn()} /></QueryClientProvider>)
  const stream = await screen.findByRole('button', { name: /Synthetic A/ })
  stream.focus()
  fireEvent.keyDown(document.activeElement!, { key: 'BrowserBack' })
  expect(back).toHaveBeenCalledOnce()
})

it('keeps cached streams usable through a refetch and error, replacing only on success', async () => {
  let resolveRefresh!: (value: unknown) => void
  request.mockResolvedValue(response())
  const play = vi.fn(), qc = client()
  render(<QueryClientProvider client={qc}><MediaDetailPage media={movie} onPlay={play} onBack={vi.fn()} /></QueryClientProvider>)
  await screen.findByRole('button', { name: /Synthetic A/ })
  request.mockImplementation((path: string) => path.startsWith('/api/streams/') ? new Promise(resolve => { resolveRefresh = resolve }) : Promise.resolve(response()))
  let refresh!: Promise<void>
  act(() => { refresh = qc.invalidateQueries({ queryKey: ['streams', 'movie', movie.id] }) })
  await screen.findByText('Refreshing streams…')
  await userEvent.click(screen.getByRole('button', { name: /Synthetic A/ }))
  expect(play).toHaveBeenCalledOnce()
  await act(async () => { resolveRefresh(response([streams[1]])); await refresh })
  await waitFor(() => expect(screen.queryByRole('button', { name: /Synthetic A/ })).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: /Synthetic B/ })).toBeEnabled()
  request.mockRejectedValue(new Error('Provider unavailable'))
  await act(async () => { await qc.invalidateQueries({ queryKey: ['streams', 'movie', movie.id] }) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Provider unavailable')
  expect(screen.getByRole('button', { name: /Synthetic B/ })).toBeEnabled()
})

it('shows a named partial provider failure with its reason and retries only that provider', async () => {
  const addons = ['fast', 'torbox'].map(id => ({ id, manifest: { name: id === 'torbox' ? 'TorBox' : 'Fast addon', resources: ['stream'], types: ['movie'] } }))
  let failed = true
  request.mockImplementation((path: string) => {
    if (path === '/api/addons') return Promise.resolve({ items: addons })
    if (path.endsWith('addon_id=torbox') && failed) return Promise.resolve({ responses: [], errors: [{ addon_id: 'torbox', error: 'HTTP 401. Check your provider API key.' }] })
    return Promise.resolve(response([streams[path.endsWith('addon_id=torbox') ? 1 : 0]]))
  })
  const play = vi.fn()
  render(<QueryClientProvider client={client()}><MediaDetailPage media={movie} onPlay={play} onBack={vi.fn()} /></QueryClientProvider>)
  expect(await screen.findByRole('alert')).toHaveTextContent('TorBox failed: HTTP 401. Check your provider API key.')
  await userEvent.click(screen.getByRole('button', { name: /Synthetic A/ }))
  expect(play).toHaveBeenCalledOnce()
  const fastCalls = request.mock.calls.filter(([path]) => path.endsWith('addon_id=fast')).length
  failed = false
  await userEvent.click(screen.getByRole('button', { name: 'Retry TorBox' }))
  expect(await screen.findByRole('button', { name: /Synthetic B/ })).toBeEnabled()
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(request.mock.calls.filter(([path]) => path.endsWith('addon_id=fast'))).toHaveLength(fastCalls)
})


it('shows all failed addons with separate retries without blocking the detail page', async () => {
  const addons = ['TorBox', 'Other provider'].map(id => ({ id, manifest: { name: id, resources: ['stream'], types: ['movie'] } }))
  request.mockImplementation((path: string) => Promise.resolve(path === '/api/addons' ? { items: addons } : path.startsWith('/api/streams/') ? { responses: [], errors: [{ addon_id: 'failed', error: 'Provider took too long to respond.' }] } : response([])))
  render(<QueryClientProvider client={client()}><MediaDetailPage media={movie} onPlay={vi.fn()} onBack={vi.fn()} /></QueryClientProvider>)
  expect(await screen.findByRole('button', { name: 'Retry TorBox' })).toBeEnabled()
  expect(await screen.findByRole('button', { name: 'Retry Other provider' })).toBeEnabled()
  expect(screen.getAllByRole('alert')).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled()
})
