import { QueryClient } from '@tanstack/react-query'
import { afterEach, expect, it } from 'vitest'
import { playerOverrideQuery, updatePlayerOverride } from './queries'
import { useAppStore } from '@/store/app-store'

afterEach(() => { useAppStore.getState().setActiveProfileId(null); localStorage.clear() })
it('separates profile caches and captures the profile when a query is created', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  try {
    useAppStore.getState().setActiveProfileId('alice')
    await updatePlayerOverride('series', 'show', { subtitle_size: 2 })
    const alice = playerOverrideQuery('series', 'show')
    useAppStore.getState().setActiveProfileId('bob')
    await updatePlayerOverride('series', 'show', { subtitle_size: 0.75 })
    const bob = playerOverrideQuery('series', 'show')
    expect(await client.fetchQuery(alice)).toEqual({ subtitle_size: 2 })
    expect(await client.fetchQuery(bob)).toEqual({ subtitle_size: 0.75 })
    expect(alice.queryKey).not.toEqual(bob.queryKey)
  } finally { client.clear() }
})
