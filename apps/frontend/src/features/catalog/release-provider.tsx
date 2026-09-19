import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { apiRequest } from '@/api/client'
import { browseLayoutQuery, episodesQuery } from '@/api/queries'
import { useAppStore } from '@/store/app-store'
import { defaultReleasePreferences, ReleaseContext, selectReleases, withReleaseSlot } from './release-feed'

const librarySchema = z.object({ items: z.array(z.object({ media_id: z.string(), title: z.string(), poster: z.string().nullable() })), truncated: z.boolean() })
export function ReleaseProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const profileId = useAppStore(state => state.activeProfileId)
  const revision = useAppStore(state => state.authRevision)
  const layout = useQuery(browseLayoutQuery)
  const preferences = { ...defaultReleasePreferences, ...layout.data?.newEpisodes }
  const shouldLoad = enabled && Boolean(profileId) && (preferences.showBadges || !layout.data?.pages.home.hidden.includes('new_episodes'))
  const library = useQuery({ queryKey: ['lists', 'episode-library', profileId, revision, preferences.listId], queryFn: async ({ signal }) => librarySchema.parse(await apiRequest('/api/episode-library?listId=' + encodeURIComponent(preferences.listId), { signal })), enabled: shouldLoad, staleTime: 60_000 })
  const shows = library.data?.items ?? []
  const queries = useQueries({ queries: shows.map(show => {
    const options = episodesQuery(show.media_id, profileId)
    return { ...options, enabled: shouldLoad, queryFn: (context: Parameters<NonNullable<typeof options.queryFn>>[0]) => withReleaseSlot(context.signal, async () => {
      if (useAppStore.getState().activeProfileId !== profileId || useAppStore.getState().authRevision !== revision) throw new DOMException('Profile changed', 'AbortError')
      return options.queryFn!(context)
    }) }
  }) })
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer) }, [])
  const releases = selectReleases(queries.flatMap((query, index) => (query.data?.items ?? []).map(episode => ({ show: shows[index], episode }))), preferences, now)
  const counts: Record<string, number> = {}
  if (preferences.showBadges) for (const { show, episode } of releases) if (episode.releaseState === 'released' && !episode.watched) counts[show.media_id] = (counts[show.media_id] ?? 0) + 1
  return <ReleaseContext value={{ releases, counts, preferences, loading: library.isFetching || queries.some(query => query.isFetching), incomplete: Boolean(library.error || library.data?.truncated || queries.some(query => query.error || query.data?.stale)) }}>{children}</ReleaseContext>
}
