import { useQueries, useQuery } from '@tanstack/react-query'

import { browseLayoutQuery, catalogsQuery, listItemsQuery, listsQuery } from '@/api/queries'
import type { BrowsePageKey, MediaPreview } from '@/api/types'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { cn } from '@/lib/utils'
import { compactHeader, pageHeader, pageStack } from '@/lib/styles'

import { BrowseSections } from './browse-sections'
import { buildBrowseRowCandidates, createDefaultBrowseLayout, normalizeBrowseLayout, resolveVisibleBrowseRows } from './browse-layout'

export function CatalogPage({
  type,
  title,
  onOpenMedia,
}: {
  type: 'movie' | 'series'
  title: string
  onOpenMedia: (media: MediaPreview) => void
}) {
  const page: BrowsePageKey = type === 'movie' ? 'movies' : 'series'
  const catalogs = useQuery(catalogsQuery)
  const lists = useQuery(listsQuery)
  const browseLayout = useQuery(browseLayoutQuery)

  const listItems = useQueries({
    queries: (lists.data ?? []).map((list) => listItemsQuery(list.id)),
  })

  const listItemsByListId = Object.fromEntries(
    (lists.data ?? []).map((list, index) => [list.id, listItems[index]?.data ?? []]),
  )

  const candidates = buildBrowseRowCandidates(page, catalogs.data ?? [], lists.data ?? [])
  const layout = normalizeBrowseLayout(browseLayout.data ?? createDefaultBrowseLayout())
  const rows = resolveVisibleBrowseRows(candidates, layout.pages[page])

  const isLoading =
    catalogs.isLoading ||
    lists.isLoading ||
    browseLayout.isLoading ||
    listItems.some((query) => query.isLoading)
  const listItemsError = listItems.find((query) => query.error)?.error ?? null

  return (
    <div className={pageStack}>
      <header className={cn(pageHeader, compactHeader)}>
        <h1 className="m-0 leading-[0.95] tracking-normal">{title}</h1>
      </header>

      {isLoading ? <LoadingState label={`Loading ${title.toLowerCase()} catalogs`} /> : null}
      {catalogs.error ? <ErrorState error={catalogs.error} /> : null}
      {lists.error ? <ErrorState error={lists.error} /> : null}
      {browseLayout.error ? <ErrorState error={browseLayout.error} /> : null}
      {listItemsError ? <ErrorState error={listItemsError} /> : null}
      {!isLoading && !rows.length ? (
        <EmptyState title={`No ${title.toLowerCase()} sections`} body="Adjust browse layout in Settings or install addons." />
      ) : null}

      <BrowseSections
        page={page}
        rows={rows}
        continueItems={[]}
        listItemsByListId={listItemsByListId}
        onOpenMedia={(media) => onOpenMedia(media)}
      />
    </div>
  )
}
