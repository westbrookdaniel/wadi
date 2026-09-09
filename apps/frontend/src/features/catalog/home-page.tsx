import { useQueries, useQuery } from '@tanstack/react-query'

import { browseLayoutQuery, catalogsQuery, continueWatchingQuery, listItemsQuery, listsQuery } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { EmptyState, ErrorState } from '@/components/status'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { pageStack } from '@/lib/styles'

import { ContinuePanel } from './continue-panel'
import { FeaturedFilm } from './featured-film'
import { BrowseSections } from './browse-sections'
import { buildBrowseRowCandidates, createDefaultBrowseLayout, normalizeBrowseLayout, resolveVisibleBrowseRows } from './browse-layout'

export function HomePage({
  onOpenMedia,
  onOpenSettings,
}: {
  onOpenMedia: (media: MediaPreview, preferredVideoId?: string | null) => void
  onOpenSettings: () => void
}) {
  const catalogs = useQuery(catalogsQuery)
  const continueWatching = useQuery(continueWatchingQuery(12))
  const lists = useQuery(listsQuery)
  const browseLayout = useQuery(browseLayoutQuery)

  const listItems = useQueries({
    queries: (lists.data ?? []).map((list) => listItemsQuery(list.id)),
  })

  const listItemsByListId = Object.fromEntries(
    (lists.data ?? []).map((list, index) => [list.id, listItems[index]?.data ?? []]),
  )

  const candidates = buildBrowseRowCandidates('home', catalogs.data ?? [], lists.data ?? [])
  const layout = normalizeBrowseLayout(browseLayout.data ?? createDefaultBrowseLayout())
  const rows = resolveVisibleBrowseRows(candidates, layout.pages.home)

  const continueItems = continueWatching.data ?? []
  const hasCatalogs = Boolean(catalogs.data?.length)
  const hasContinueWatching = Boolean(continueItems.length)
  const hasWatchlistContent = Object.values(listItemsByListId).some((items) => items.length > 0)
  const listItemsError = listItems.find((query) => query.error)?.error ?? null
  const isLoading =
    catalogs.isLoading ||
    continueWatching.isLoading ||
    lists.isLoading ||
    browseLayout.isLoading ||
    listItems.some((query) => query.isLoading)
  const showSetup = !isLoading && !hasContinueWatching && !hasCatalogs && !hasWatchlistContent

  return (
    <div className={pageStack}>
      {catalogs.error ? <ErrorState error={catalogs.error} /> : null}
      {continueWatching.error ? <ErrorState error={continueWatching.error} /> : null}
      {lists.error ? <ErrorState error={lists.error} /> : null}
      {browseLayout.error ? <ErrorState error={browseLayout.error} /> : null}
      {listItemsError ? <ErrorState error={listItemsError} /> : null}

      {isLoading && catalogs.data === undefined && continueWatching.data === undefined && lists.data === undefined && browseLayout.data === undefined ? (
        <div aria-label="Loading home page" className="grid gap-6">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="aspect-[2/3] rounded-xl" />)}
          </div>
        </div>
      ) : null}
      {showSetup ? (
        <EmptyState
          title="Go to Settings to add addons"
          body="Install an addon to get catalogs, streams, and metadata to start browsing."
          action={
            <Button size="sm" type="button" onClick={onOpenSettings}>
              Open Settings
            </Button>
          }
        />
      ) : null}

      {!isLoading && !showSetup ? <div className={rows.some(row => row.kind === 'continue') ? 'home-top' : undefined}>
        {rows.some(row => row.kind === 'continue') ? <ContinuePanel items={continueItems} onOpen={onOpenMedia} /> : null}
        {catalogs.data?.[0] ? <FeaturedFilm entry={catalogs.data[0]} onOpen={onOpenMedia} /> : null}
      </div> : null}
      {!showSetup ? (
        <BrowseSections
          page="home"
          rows={rows.filter(row => row.kind !== 'continue')}
          continueItems={continueItems}
          listItemsByListId={listItemsByListId}
          onOpenMedia={onOpenMedia}
        />
      ) : null}
    </div>
  )
}
