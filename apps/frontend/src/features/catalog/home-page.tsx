import { useQueries, useQuery } from '@tanstack/react-query'

import { browseLayoutQuery, catalogsQuery, continueWatchingQuery, listItemsQuery, listsQuery } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { EmptyState, ErrorState, PosterSkeletonRow } from '@/components/status'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { pageStack } from '@/lib/styles'

import { ContinuePanel } from './continue-panel'
import { FeaturedFilm, FeaturedTitles } from './featured-film'
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

  const candidates = buildBrowseRowCandidates(catalogs.data ?? [], lists.data ?? [])
  const layout = normalizeBrowseLayout(browseLayout.data ?? createDefaultBrowseLayout())
  const rows = resolveVisibleBrowseRows(candidates, layout.pages.home)

  const heroRow = candidates.find(row => row.key === layout.hero?.source)
  const heroEntry = heroRow?.catalogEntry ?? catalogs.data?.[0]
  const heroList = heroRow?.list ? listItemsByListId[heroRow.list.id] ?? [] : null
  const heroItems: MediaPreview[] = (heroList ?? []).map(item => ({ id: item.media_id, type: item.media_type, name: item.title, poster: item.poster ?? undefined, raw: item.meta ?? {} }))
  const showHero = !layout.hero?.hidden && Boolean(heroList ? heroItems.length : heroEntry)
  const continueItems = continueWatching.data ?? []
  const hasCatalogs = Boolean(catalogs.data?.length)
  const hasContinueWatching = Boolean(continueItems.length)
  const showContinueWatching = hasContinueWatching && rows.some(row => row.kind === 'continue')
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

      {isLoading ? (
        <div aria-label="Loading home page" className="grid gap-6">
          <div className="home-top"><Skeleton className="min-h-[420px] max-[600px]:min-h-[400px] rounded-[14px]" /><Skeleton className="min-h-[420px] rounded-[14px] max-[1000px]:hidden" /></div>
          <div className="grid gap-6"><Skeleton className="h-12 w-36" /><PosterSkeletonRow /></div>
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

      {!isLoading && !showSetup ? <div className={showContinueWatching && showHero ? 'home-top' : undefined}>
        {showHero ? heroList ? <FeaturedTitles items={heroItems} rotate={layout.hero?.rotate} onOpen={onOpenMedia} /> : heroEntry ? <FeaturedFilm key={layout.hero?.source ?? 'auto'} entry={heroEntry} rotate={layout.hero?.rotate} onOpen={onOpenMedia} /> : null : null}
        {showContinueWatching ? <ContinuePanel items={continueItems} onOpen={onOpenMedia} /> : null}
      </div> : null}
      {!isLoading && !showSetup ? (
        <BrowseSections
          rows={rows.filter(row => row.kind !== 'continue')}
          continueItems={continueItems}
          listItemsByListId={listItemsByListId}
          onOpenMedia={onOpenMedia}
        />
      ) : null}
    </div>
  )
}
