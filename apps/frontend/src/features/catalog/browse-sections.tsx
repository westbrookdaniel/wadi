import { NewEpisodesSection } from './new-episodes'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { discoverSearchForRow } from './discover'
import { useQuery } from '@tanstack/react-query'

import { metaQuery } from '@/api/queries'
import type { ContinueWatchingItem, ListItem, MediaPreview } from '@/api/types'
import { MediaRow } from '@/components/media-row'
import { MediaCard } from '@/features/media/media-card'
import { contentSection, sectionAction, sectionHeading } from '@/lib/styles'

import type { BrowseRowCandidate } from './browse-layout'
import { CatalogSection } from './catalog-section'
import { mediaPreviewFromMeta } from './media-preview'

export function BrowseSections({
  rows,
  continueItems,
  listItemsByListId,
  onOpenMedia,
}: {
  rows: BrowseRowCandidate[]
  continueItems: ContinueWatchingItem[]
  listItemsByListId: Record<string, ListItem[]>
  onOpenMedia: (media: MediaPreview, preferredVideoId?: string | null) => void
}) {
  return (
    <>
      {rows.map((row) => {
        if (row.kind === 'new-episodes') return <NewEpisodesSection key={row.key} onOpenMedia={onOpenMedia} />
        if (row.kind === 'catalog' && row.catalogEntry) {
          return (
            <CatalogSection
              key={row.key}
              entry={row.catalogEntry}
              entries={row.catalogEntries}
              seeAll={discoverSearchForRow(row)}
              onOpen={(media) => onOpenMedia(media, null)}
            />
          )
        }

        if (row.kind === 'continue') {
          if (!continueItems.length) {
            return null
          }

          return (
            <section className={contentSection} key={row.key}>
              <div className={sectionHeading}>
                <div>
                  <h2 className="m-0 tracking-normal">Continue Watching</h2>
                </div>
              </div>
              <MediaRow>
                {continueItems.map((item) => (
                  <ContinueWatchingCard
                    key={`${item.media_type}-${item.media_id}-${item.video_id ?? 'movie'}`}
                    item={item}
                    onOpenMedia={onOpenMedia}
                  />
                ))}
              </MediaRow>
            </section>
          )
        }

        if (row.kind === 'watchlist' && row.list) {
          const rawItems = listItemsByListId[row.list.id] ?? []
          const items = rawItems
          if (!items.length) {
            return null
          }

          return (
            <section className={contentSection} key={row.key}>
              <div className={sectionHeading}>
                <div>
                  <h2 className="m-0 tracking-normal">{row.list.name}</h2>
                </div>
                <Link to="/discover" search={discoverSearchForRow(row)} aria-label={`See all ${row.list.name}`} className={sectionAction}>See all<ArrowRight className="size-3.5" aria-hidden="true" /></Link>
              </div>
              <MediaRow>
                {items.map((item) => {
                  const media = mediaFromListItem(item)
                  return <MediaCard key={item.id} media={media} onOpen={() => onOpenMedia(media, null)} />
                })}
              </MediaRow>
            </section>
          )
        }

        return null
      })}
    </>
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
        progress={{
          position: item.position_seconds,
          duration: item.duration_seconds,
        }}
      />
    )
  }

  return (
    <MediaCard
      media={media}
      onOpen={() => onOpenMedia(media, item.video_id)}
      watched={item.watched}
      progress={{
        position: item.position_seconds,
        duration: item.duration_seconds,
      }}
    />
  )
}

function mediaFromListItem(item: ListItem): MediaPreview {
  return {
    id: item.media_id,
    type: item.media_type,
    name: item.title,
    poster: item.poster ?? undefined,
    releaseInfo: item.release_info ?? undefined,
    raw: item.meta ?? {
      id: item.media_id,
      type: item.media_type,
      name: item.title,
    },
  }
}
