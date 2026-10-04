import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { useAutoPlayback } from '@/store/auto-playback'
import { StreamList } from './stream-list'
vi.mock('@/api/queries', () => ({ addonsQuery: { queryKey: ['addons'], queryFn: async () => [] } }))
afterEach(() => { cleanup(); useAutoPlayback.getState().reset() })
const streams = [{ url: 'https://example.test/stream', title: '1080p English 1 GB' }]
it('keeps a recommendation manual, including legacy skip-selection settings', async () => {
  useAutoPlayback.getState().update({ enabled: true, skipSelection: true })
  const client = new QueryClient(), play = vi.fn()
  const page = (loading: boolean) => <QueryClientProvider client={client}><StreamList streams={streams} isLoading={loading} onPlay={play} /></QueryClientProvider>
  const view = render(page(true)); expect(play).not.toHaveBeenCalled()
  view.rerender(page(false)); expect(play).not.toHaveBeenCalled()
  expect(screen.getByText(/Recommended/)).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: /1080p English/ }))
  expect(play).toHaveBeenCalledExactlyOnceWith(streams[0])
})
it('shows unmatched streams without launching anything', () => {
  useAutoPlayback.getState().update({ enabled: true, skipSelection: true })
  const client = new QueryClient(), play = vi.fn()
  render(<QueryClientProvider client={client}><StreamList streams={[{ title: '1080p', infoHash: 'abc' }]} isLoading={false} onPlay={play} /></QueryClientProvider>)
  expect(screen.getByText(/No stream matches/)).toBeVisible(); expect(play).not.toHaveBeenCalled()
})
