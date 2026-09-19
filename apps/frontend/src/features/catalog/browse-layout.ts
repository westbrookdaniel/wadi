import type {
  BrowseLayout,
  BrowseLayoutPage,
  CatalogEntry,
  UserList,
} from '@/api/types'

export type BrowseRowKind = 'catalog' | 'watchlist' | 'continue' | 'new-episodes'

export type BrowseRowCandidate = {
  key: string
  kind: BrowseRowKind
  title: string
  subtitle?: string
  catalogEntries?: CatalogEntry[]
  catalogEntry?: CatalogEntry
  list?: UserList
}

export const CONTINUE_WATCHING_ROW_KEY = 'continue_watching'

const emptyPage = (): BrowseLayoutPage => ({ order: [], hidden: [] })

export function createDefaultBrowseLayout(): BrowseLayout {
  return {
    pages: {
      home: emptyPage(),
    },
  }
}

export function normalizeBrowseLayout(layout: Partial<BrowseLayout> | null | undefined): BrowseLayout {
  return {
    ...(layout?.newEpisodes ? { newEpisodes: layout.newEpisodes } : {}),
    ...(layout?.hero ? { hero: layout.hero } : {}),
    pages: {
      home: normalizeBrowseLayoutPage(layout?.pages?.home),
    },
  }
}

export function normalizeBrowseLayoutPage(page: Partial<BrowseLayoutPage> | null | undefined): BrowseLayoutPage {
  return {
    order: dedupeRowKeys(page?.order ?? []),
    hidden: dedupeRowKeys(page?.hidden ?? []),
    ...(page?.catalogModes ? { catalogModes: page.catalogModes } : {}),
  }
}

export function dedupeRowKeys(values: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const value of values) {
    const key = value.trim()
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    normalized.push(key)
  }
  return normalized
}

export function catalogRowKey(entry: CatalogEntry): string {
  return `catalog:${entry.addon_id}:${entry.catalog.type}:${entry.catalog.id}`
}

export function watchlistRowKey(listId: string): string {
  return `watchlist:${listId}`
}

export function buildBrowseRowCandidates(
  catalogs: CatalogEntry[],
  lists: UserList[],
): BrowseRowCandidate[] {
  const rows: BrowseRowCandidate[] = []

  rows.push({ key: CONTINUE_WATCHING_ROW_KEY, kind: 'continue', title: 'Continue Watching' })
  rows.push({ key: 'new_episodes', kind: 'new-episodes', title: 'New episodes', subtitle: 'Releases from shows in your lists' })

  for (const entry of catalogs) {
    if (entry.catalog.extra?.some(extra => extra.name === 'search' && extra.isRequired)) continue
    const matching = ['movie', 'series'].includes(entry.catalog.type)
      ? rows.find(row => row.kind === 'catalog' && row.catalogEntry?.addon_id === entry.addon_id && row.title.toLowerCase() === (entry.catalog.name ?? entry.catalog.id).toLowerCase() && !row.catalogEntries?.some(item => item.catalog.type === entry.catalog.type))
      : undefined
    if (matching) {
      matching.catalogEntries?.push(entry)
      continue
    }
    rows.push({
      catalogEntries: [entry],
      key: catalogRowKey(entry),
      kind: 'catalog',
      title: entry.catalog.name ?? entry.catalog.id,
      subtitle: entry.addon_name,
      catalogEntry: entry,
    })
  }

  for (const list of lists) {
    rows.push({
      key: watchlistRowKey(list.id),
      kind: 'watchlist',
      title: list.name,
      subtitle: 'Watchlist',
      list,
    })
  }

  return rows
}

export function resolveVisibleBrowseRows(
  candidates: BrowseRowCandidate[],
  pageLayout: BrowseLayoutPage,
): BrowseRowCandidate[] {
  const ordered = resolveOrderedBrowseRows(candidates, pageLayout)
  const hiddenKeys = new Set(pageLayout.hidden)
  return ordered.filter((row) => !hiddenKeys.has(row.key)).map(row => {
    const mode = pageLayout.catalogModes?.[row.key] ?? 'combined'
    return mode === 'combined' ? row : { ...row, catalogEntries: row.catalogEntries?.filter(entry => entry.catalog.type === mode) }
  })
}

export function resolveOrderedBrowseRows(
  candidates: BrowseRowCandidate[],
  pageLayout: BrowseLayoutPage,
): BrowseRowCandidate[] {
  const byKey = new Map<string, BrowseRowCandidate>()
  const discoveredKeys: string[] = []
  for (const candidate of candidates) {
    if (byKey.has(candidate.key)) {
      continue
    }
    byKey.set(candidate.key, candidate)
    discoveredKeys.push(candidate.key)
  }

  const orderedKeys = pageLayout.order.filter((key) => byKey.has(key))
  for (const key of discoveredKeys) {
    if (!orderedKeys.includes(key)) {
      orderedKeys.push(key)
    }
  }

  return orderedKeys
    .flatMap((key) => {
      const row = byKey.get(key)
      return row ? [row] : []
    })
}
