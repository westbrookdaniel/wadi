import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { apiRequest } from '@/api/client'
import { skipSegmentsQuery, type SkipSegment } from './skip-segments'
vi.mock('@/api/client', () => ({ apiRequest: vi.fn() }))
afterEach(() => vi.resetAllMocks())
it('does not expose a late result from the previous episode after switching', async () => {
  let resolveFirst!: (value: { items: SkipSegment[] }) => void
  vi.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
    .mockResolvedValueOnce({ items: [{ type: 'recap', start: 0, end: 20 }] })
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result, rerender, unmount } = renderHook(({ episode }) => useQuery(skipSegmentsQuery({ mediaType: 'series', mediaId: 'tt0903747', videoId: `tt0903747:1:${episode}` }, true)), { wrapper, initialProps: { episode: 1 } })
  rerender({ episode: 2 })
  await waitFor(() => expect(result.current.data?.[0]?.type).toBe('recap'))
  await act(async () => resolveFirst({ items: [{ type: 'intro', start: 50, end: 80 }] }))
  expect(result.current.data).toEqual([{ type: 'recap', start: 0, end: 20 }])
  expect(vi.mocked(apiRequest).mock.calls[1][0]).toContain('episode=2')
  unmount(); client.clear()
})
it('does not request unsupported identifiers and tolerates API outages without retries', async () => {
  vi.mocked(apiRequest).mockRejectedValue(new Error('unavailable'))
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const { result, rerender, unmount } = renderHook(({ id }) => useQuery(skipSegmentsQuery({ mediaType: 'movie', mediaId: id, videoId: null }, true)), { wrapper, initialProps: { id: 'addon:123' } })
  expect(apiRequest).not.toHaveBeenCalled()
  rerender({ id: 'tt0371746' })
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.data).toBeUndefined()
  expect(apiRequest).toHaveBeenCalledOnce()
  unmount(); client.clear()
})
it('does not request segments by default and keeps account query caches separate', () => {
  const target = { mediaType: 'movie', mediaId: 'tt0371746', videoId: null }
  expect(skipSegmentsQuery(target).enabled).toBe(false)
  expect(skipSegmentsQuery(target, false).enabled).toBe(false)
  expect(skipSegmentsQuery(target, true, 1).queryKey).not.toEqual(skipSegmentsQuery(target, true, 2).queryKey)
})
