import { QueryClient } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store/app-store'
import { streamsQuery, watchDataQuery } from './queries'

const request = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ apiRequest: request, ApiError: Error }))
afterEach(() => { request.mockReset(); useAppStore.setState({ activeProfileId: null }) })

it('never reuses fresh watch or stream data from another profile, even after a late response', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  const pending = Promise.withResolvers<unknown>()
  useAppStore.setState({ activeProfileId: 'alice' })
  request.mockReturnValue(pending.promise)
  const alice = watchDataQuery('movie', 'film')
  const aliceStreams = streamsQuery('movie', 'film', true, 'provider')
  const old = client.fetchQuery(alice)
  useAppStore.setState({ activeProfileId: 'bob' })
  const bob = watchDataQuery('movie', 'film')
  expect(bob.queryKey).not.toEqual(alice.queryKey)
  expect(streamsQuery('movie', 'film', true, 'provider').queryKey).not.toEqual(aliceStreams.queryKey)
  pending.resolve({ items: [{ position_seconds: 100 }] })
  await old
  request.mockResolvedValue({ items: [] })
  expect(await client.fetchQuery(bob)).toEqual({ items: [] })
  useAppStore.getState().setToken('new-account-session')
  expect(watchDataQuery('movie', 'film').queryKey).not.toEqual(bob.queryKey)
  client.clear()
})
