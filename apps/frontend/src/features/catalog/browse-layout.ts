import type {
  BrowseLayout,
  BrowseLayoutPage,
  BrowsePageKey,
  CatalogEntry,
  ListItem,
  UserList,
} from '@/api/types'

export type BrowseRowKind = 'catalog' | 'watchlist' | 'continue'

export type BrowseRowCandidate = {
  key: string
  kind: BrowseRowKind
  title: string
  subtitle?: string
  catalogEntry?: CatalogEntry
  list?: UserList
}

export const CONTINUE_WATCHING_ROW_KEY = 'continue_watching'

const emptyPage = (): BrowseLayoutPage => ({ order: [], hidden: [] })

export function createDefaultBrowseLayout(): BrowseLayout {
  return {
    pages: {
      home: emptyPage(),
      movies: emptyPage(),
      series: emptyPage(),
    },
  }
}

export function normalizeBrowseLayout(layout: Partial<BrowseLayout> | null | undefined): BrowseLayout {
  return {
    pages: {
      home: normalizeBrowseLayoutPage(layout?.pages?.home),
      movies: normalizeBrowseLayoutPage(layout?.pages?.movies),
      series: normalizeBrowseLayoutPage(layout?.pages?.series),
    },
  }
}

export function normalizeBrowseLayoutPage(page: Partial<BrowseLayoutPage> | null | undefined): BrowseLayoutPage {
  return {
    order: dedupeRowKeys(page?.order ?? []),
    hidden: dedupeRowKeys(page?.hidden ?? []),
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
  page: BrowsePageKey,
  catalogs: CatalogEntry[],
  lists: UserList[],
): BrowseRowCandidate[] {
  const rows: BrowseRowCandidate[] = []

  if (page === 'home') {
    rows.push({
      key: CONTINUE_WATCHING_ROW_KEY,
      kind: 'continue',
      title: 'Continue Watching',
    })
  }

  for (const entry of catalogs) {
    if (page === 'movies' && entry.catalog.type !== 'movie') {
      continue
    }
    if (page === 'series' && entry.catalog.type !== 'series') {
      continue
    }
    rows.push({
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
  return ordered.filter((row) => !hiddenKeys.has(row.key))
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

export function filterWatchlistItemsForPage(page: BrowsePageKey, items: ListItem[]): ListItem[] {
  if (page === 'home') {
    return items
  }

  const type = page === 'movies' ? 'movie' : 'series'
  return items.filter((item) => item.media_type === type)
}
