import { QueryClient } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { metaQuery } from './queries'

const request = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ apiRequest: request, ApiError: Error }))
afterEach(() => request.mockReset())

it('keeps addon identifiers containing URL delimiters inside the metadata path segment', async () => {
  request.mockResolvedValue({ responses: [] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    await client.fetchQuery(metaQuery('movie', 'provider:film/part?lang=en#edition'))
    expect(request).toHaveBeenCalledWith('/api/meta/movie/provider%3Afilm%2Fpart%3Flang%3Den%23edition')
  } finally { client.clear() }
})
