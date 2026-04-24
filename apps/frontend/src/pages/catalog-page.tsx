import { useQuery } from '@tanstack/react-query'

import { catalogsQuery } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { CatalogSection } from '@/components/catalog-section'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'

export function CatalogPage({
  type,
  title,
  onOpenMedia,
}: {
  type: 'movie' | 'series'
  title: string
  onOpenMedia: (media: MediaPreview) => void
}) {
  const catalogs = useQuery(catalogsQuery)
  const entries = (catalogs.data ?? []).filter((entry) => entry.catalog.type === type)

  return (
    <div className="page-stack">
      <header className="page-header compact-header">
        <h1>{title}</h1>
      </header>

      {catalogs.isLoading ? <LoadingState label={`Loading ${title.toLowerCase()} catalogs`} /> : null}
      {catalogs.error ? <ErrorState error={catalogs.error} /> : null}
      {!catalogs.isLoading && !entries.length ? (
        <EmptyState title={`No ${title.toLowerCase()} catalogs`} body="Install an addon that provides this content type." />
      ) : null}

      {entries.map((entry) => (
        <CatalogSection key={`${entry.addon_id}-${entry.catalog.id}`} entry={entry} onOpen={onOpenMedia} />
      ))}
    </div>
  )
}
