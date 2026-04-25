import { useQuery } from '@tanstack/react-query'

import { catalogsQuery, continueWatchingQuery, metaQuery } from '@/api/queries'
import type { ContinueWatchingItem, MediaPreview } from '@/api/types'
import { CatalogSection } from '@/components/catalog-section'
import { MediaCard } from '@/components/media-card'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { Button } from '@/components/ui/button'
import { contentSection, mediaRow, pageStack, sectionHeading } from '@/lib/styles'
import { useAppStore } from '@/store/app-store'

export function HomePage({
  onOpenMedia,
}: {
  onOpenMedia: (media: MediaPreview, preferredVideoId?: string | null) => void
}) {
  const setActivePage = useAppStore((state) => state.setActivePage)
  const catalogs = useQuery(catalogsQuery)
  const continueWatching = useQuery(continueWatchingQuery(12))
  const continueItems = continueWatching.data ?? []
  const hasContinueWatching = Boolean(continueItems.length)
  const hasCatalogs = Boolean(catalogs.data?.length)
  const showSetup =
    !catalogs.isLoading &&
    !continueWatching.isLoading &&
    !hasContinueWatching &&
    !hasCatalogs

  return (
    <div className={pageStack}>
      {catalogs.isLoading || continueWatching.isLoading ? <LoadingState /> : null}
      {catalogs.error ? <ErrorState error={catalogs.error} /> : null}
      {continueWatching.error ? <ErrorState error={continueWatching.error} /> : null}

      {showSetup ? (
        <EmptyState
          title="Go to Settings to add addons"
          body="Install an addon to get catalogs, streams, and metadata to start browsing."
          action={
            <Button size="sm" type="button" onClick={() => setActivePage('settings')}>
              Open Settings
            </Button>
          }
        />
      ) : null}

      {!showSetup && hasContinueWatching ? (
        <section className={contentSection}>
          <div className={sectionHeading}>
            <div>
              <h2 className="m-0 tracking-normal">Continue Watching</h2>
            </div>
          </div>
          <div className={mediaRow}>
            {continueItems.map((item) => (
              <ContinueWatchingCard
                key={`${item.media_type}-${item.media_id}-${item.video_id ?? 'movie'}`}
                item={item}
                onOpenMedia={onOpenMedia}
              />
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

function ContinueWatchingCard({
  item,
  onOpenMedia,
}: {
  item: ContinueWatchingItem
  onOpenMedia: (media: MediaPreview, preferredVideoId?: string | null) => void
}) {
  const meta = useQuery(metaQuery(item.media_type, item.media_id))
  const media = mediaPreviewFromMeta(item, meta.data)

  if (!media) {
    return (
      <MediaCard
        media={{
          id: item.media_id,
          type: item.media_type,
          name: item.media_id,
          raw: { id: item.media_id, type: item.media_type },
        }}
        progress={{ position: item.position_seconds, duration: item.duration_seconds }}
      />
    )
  }

  return (
    <MediaCard
      media={media}
      onOpen={() => onOpenMedia(media, item.video_id)}
      watched={item.watched}
      progress={{ position: item.position_seconds, duration: item.duration_seconds }}
    />
  )
}

function mediaPreviewFromMeta(item: ContinueWatchingItem, data: unknown): MediaPreview | null {
  const responses =
    data && typeof data === 'object' && 'responses' in data && Array.isArray(data.responses)
      ? data.responses
      : []

  for (const response of responses) {
    if (!response || typeof response !== 'object') {
      continue
    }

    const body = 'response' in response ? response.response : null
    const meta =
      body && typeof body === 'object' && 'meta' in body && body.meta && typeof body.meta === 'object'
        ? (body.meta as Record<string, unknown>)
        : null

    if (!meta) {
      continue
    }

    const name = stringValue(meta.name) ?? stringValue(meta.title)
    if (!name) {
      continue
    }

    return {
      id: stringValue(meta.id) ?? item.media_id,
      type: stringValue(meta.type) ?? item.media_type,
      name,
      poster: stringValue(meta.poster),
      releaseInfo: stringValue(meta.releaseInfo) ?? stringValue(meta.year),
      description: stringValue(meta.description),
      raw: meta,
    }
  }

  return null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
