import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useStreams } from './use-streams'

const request = vi.fn()
vi.mock('@/api/client', () => ({ apiRequest: (...args: unknown[]) => request(...args), ApiError: Error }))
const providers = ['fast', 'slow'].map(id => ({ id, manifest: { name: id, resources: ['stream'], types: ['movie'] } }))
const response = (id: string) => ({ responses: [{ addon_id: id, response: { streams: [{ title: id, url: `https://example.test/${id}` }] } }] })
afterEach(() => request.mockReset())

it('publishes fast addon streams while another hangs, retaining only that addon on a failed refresh', async () => {
  const slow = Promise.withResolvers<ReturnType<typeof response>>()
  request.mockImplementation((path: string) => path === '/api/addons' ? Promise.resolve({ items: providers }) : path.endsWith('addon_id=fast') ? Promise.resolve(response('fast')) : slow.promise)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { result, unmount } = renderHook(() => useStreams('movie', 'film'), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
  await waitFor(() => expect(result.current.data.map(stream => stream.title)).toEqual(['fast']))
  expect(result.current.isFetching).toBe(true)
  expect(request).toHaveBeenCalledWith('/api/streams/movie/film?addon_id=slow', expect.anything())
  await act(async () => slow.resolve(response('slow')))
  await waitFor(() => expect(result.current.data.map(stream => stream.title)).toEqual(['fast', 'slow']))
  request.mockImplementation((path: string) => path.endsWith('addon_id=fast') ? Promise.resolve(response('updated')) : Promise.reject(new Error('Timed out')))
  await act(async () => { await result.current.refetch() })
  await waitFor(() => expect(result.current.data.map(stream => stream.title)).toEqual(['updated', 'slow']))
  expect(result.current.failures[0]).toMatchObject({ provider: 'slow', message: 'Timed out' })
  unmount(); client.clear()
})
