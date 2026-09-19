import { createContext } from 'react'
import type { z } from 'zod'
import type { NewEpisodesPreferences } from '@/api/types'
import type { episodeCatalogSchema } from '../media/detail/episode-catalog'

export const defaultReleasePreferences: NewEpisodesPreferences = { showBadges: true, showCalendar: true, days: 14, includeSpecials: false, listId: '' }
export type TrackedShow = { media_id: string; title: string; poster: string | null }
export type Release = { show: TrackedShow; episode: z.infer<typeof episodeCatalogSchema>['items'][number] }
export const ReleaseContext = createContext<{ releases: Release[]; counts: Record<string, number>; loading: boolean; incomplete: boolean; preferences: NewEpisodesPreferences }>({ releases: [], counts: {}, loading: false, incomplete: false, preferences: defaultReleasePreferences })

export function selectReleases(releases: Release[], preferences: NewEpisodesPreferences, now: number) {
  const start = now - preferences.days * 86400000
  return releases.filter(({ episode }) => !episode.releaseConflicting && episode.released && (preferences.includeSpecials || episode.season !== 0) && Date.parse(episode.released) >= start && Date.parse(episode.released) <= now + 7 * 86400000)
    .sort((a, b) => (a.episode.released ?? '').localeCompare(b.episode.released ?? '') || a.show.title.localeCompare(b.show.title))
}

// Bound provider traffic, and cancel queued work when its profile leaves the screen.
let active = 0
const queue: (() => void)[] = []
export async function withReleaseSlot<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  await new Promise<void>((resolve, reject) => {
    const start = () => { signal.removeEventListener('abort', abort); active++; resolve() }
    const abort = () => { const index = queue.indexOf(start); if (index >= 0) queue.splice(index, 1); reject(new DOMException('Aborted', 'AbortError')) }
    if (signal.aborted) return abort()
    if (active < 4) start()
    else { queue.push(start); signal.addEventListener('abort', abort, { once: true }) }
  })
  try { signal.throwIfAborted(); return await run() }
  finally { active--; queue.shift()?.() }
}
