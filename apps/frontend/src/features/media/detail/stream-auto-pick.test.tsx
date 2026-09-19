import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAutoPlayback } from '@/store/auto-playback'
import { StreamList } from './stream-list'
vi.mock('@/api/queries', () => ({ addonsQuery: { queryKey: ['addons'], queryFn: async () => [] }, playbackPreferencesQuery: { queryKey: ['playback-preferences'], queryFn: async () => ({ stream_action: 'internal' }), staleTime: Infinity } }))
afterEach(() => { cleanup(); useAutoPlayback.getState().reset() })
const streams = [{ url: 'https://example.test/stream', title: '1080p English 1 GB' }]
it('waits for providers, auto-launches once, and respects the return-to-selection guard', async () => {
  useAutoPlayback.getState().update({ enabled: true, skipSelection: true })
  const client = new QueryClient(); const play = vi.fn()
  client.setQueryData(['playback-preferences'], { stream_action: 'internal' })
  const page = (loading: boolean, allowed = true) => <QueryClientProvider client={client}><StreamList streams={streams} selectionKey="episode" isLoading={loading} autoPickAllowed={allowed} onPlay={play} /></QueryClientProvider>
  const view = render(page(true)); expect(play).not.toHaveBeenCalled()
  view.rerender(page(false, false)); expect(play).not.toHaveBeenCalled()
  view.rerender(page(false)); await waitFor(() => expect(play).toHaveBeenCalledOnce())
  view.rerender(page(false)); expect(play).toHaveBeenCalledOnce()
})
it('keeps external playback and unmatched streams manual', async () => {
  useAutoPlayback.getState().update({ enabled: true, skipSelection: true })
  const client = new QueryClient(); const play = vi.fn()
  client.setQueryData(['playback-preferences'], { stream_action: 'external' })
  const view = render(<QueryClientProvider client={client}><StreamList streams={streams} selectionKey="episode" isLoading={false} onPlay={play} /></QueryClientProvider>)
  expect(play).not.toHaveBeenCalled(); view.unmount()
  client.setQueryData(['playback-preferences'], { stream_action: 'internal' })
  const unmatched = render(<QueryClientProvider client={client}><StreamList streams={[{ title: '1080p', infoHash: 'abc' }]} selectionKey="episode" isLoading={false} onPlay={play} /></QueryClientProvider>)
  expect(unmatched.getByText(/No stream matches/)).toBeInTheDocument(); expect(play).not.toHaveBeenCalled()
})
