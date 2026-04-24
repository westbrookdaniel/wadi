import { useQuery } from '@tanstack/react-query'

import { catalogsQuery, listItemsQuery, listsQuery } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { CatalogSection } from '@/components/catalog-section'
import { MediaCard } from '@/components/media-card'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { useAppStore } from '@/store/app-store'

export function HomePage({ onOpenMedia }: { onOpenMedia: (media: MediaPreview) => void }) {
  const setActivePage = useAppStore((state) => state.setActivePage)
  const lists = useQuery(listsQuery)
  const catalogs = useQuery(catalogsQuery)
  const firstList = lists.data?.[0] ?? null
  const firstListItems = useQuery(listItemsQuery(firstList?.id ?? null))
  const savedItems = firstListItems.data ?? []
  const hasSavedMedia = Boolean(savedItems.length)
  const hasCatalogs = Boolean(catalogs.data?.length)
  const showSetup =
    !lists.isLoading &&
    !catalogs.isLoading &&
    !firstListItems.isLoading &&
    !hasSavedMedia &&
    !hasCatalogs

  return (
    <div className="page-stack">
      {lists.isLoading || catalogs.isLoading ? <LoadingState /> : null}
      {lists.error ? <ErrorState error={lists.error} /> : null}
      {catalogs.error ? <ErrorState error={catalogs.error} /> : null}

      {showSetup ? (
        <EmptyState
          title="Go to Settings to add addons"
          body="Install an addon to get catalogs, streams, and metadata to start browsing."
          action={
            <button className="primary-button small" type="button" onClick={() => setActivePage('settings')}>
              Open Settings
            </button>
          }
        />
      ) : null}

      {!showSetup && hasSavedMedia ? (
        <section className="content-section">
          <div className="section-heading">
            <div>
              <h2>Saved</h2>
            </div>
            <button className="text-button compact" type="button" onClick={() => setActivePage('watchlists')}>
              View all
            </button>
          </div>
          <div className="media-row">
            {savedItems.slice(0, 6).map((item) => (
              <MediaCard key={item.id} media={item} />
            ))}
          </div>
        </section>
      ) : null}

      {!showSetup && catalogs.data?.length ? (
        catalogs.data.slice(0, 3).map((entry) => (
          <CatalogSection key={`${entry.addon_id}-${entry.catalog.type}-${entry.catalog.id}`} entry={entry} onOpen={onOpenMedia} />
        ))
      ) : null}
    </div>
  )
}
