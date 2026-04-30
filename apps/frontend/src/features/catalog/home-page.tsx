import { useQueries, useQuery } from '@tanstack/react-query'

import { browseLayoutQuery, catalogsQuery, continueWatchingQuery, listItemsQuery, listsQuery } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { EmptyState, ErrorState, HomePageSkeleton } from '@/components/status'
import { Button } from '@/components/ui/button'
import { pageStack } from '@/lib/styles'

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
  const hasAnyDataLoaded =
    catalogs.data !== undefined ||
    continueWatching.data !== undefined ||
    lists.data !== undefined ||
    browseLayout.data !== undefined ||
    listItems.some((query) => query.data !== undefined)
  const listItemsError = listItems.find((query) => query.error)?.error ?? null
  const isLoading =
    catalogs.isLoading ||
    continueWatching.isLoading ||
    lists.isLoading ||
    browseLayout.isLoading ||
    listItems.some((query) => query.isLoading)
  const showLoadingState = isLoading && !hasAnyDataLoaded
  const showSetup = !isLoading && !hasContinueWatching && !hasCatalogs && !hasWatchlistContent

  return (
    <div className={pageStack}>
      {showLoadingState ? <HomePageSkeleton /> : null}
      {catalogs.error ? <ErrorState error={catalogs.error} /> : null}
      {continueWatching.error ? <ErrorState error={continueWatching.error} /> : null}
      {lists.error ? <ErrorState error={lists.error} /> : null}
      {browseLayout.error ? <ErrorState error={browseLayout.error} /> : null}
      {listItemsError ? <ErrorState error={listItemsError} /> : null}

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

      {!showSetup ? (
        <BrowseSections
          page="home"
          rows={rows}
          continueItems={continueItems}
          listItemsByListId={listItemsByListId}
          onOpenMedia={onOpenMedia}
        />
      ) : null}
    </div>
  )
}
