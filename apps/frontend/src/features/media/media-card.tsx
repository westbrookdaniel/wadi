import type { ListItem, MediaPreview } from '@/api/types'

import { cn } from '@/lib/utils'

type CardMedia = MediaPreview | ListItem

export function MediaCard({
  media,
  onOpen,
  action,
  watched,
  progress,
}: {
  media: CardMedia
  onOpen?: () => void
  action?: React.ReactNode
  watched?: boolean
  progress?: { position: number; duration?: number | null }
}) {
  const title = 'name' in media ? media.name : media.title
  const type = ('type' in media ? media.type : media.media_type)  === 'series' ? 'Series' : 'Movies'
  const poster = media.poster ?? undefined
  const release = 'name' in media ? media.releaseInfo : media.release_info

  return (
    <article className="media-card-item grid min-w-0 gap-2.5">
      <button
        className="relative aspect-[2/3] w-full cursor-pointer overflow-hidden rounded-lg border border-border bg-card text-muted-foreground hover:outline-2 hover:outline-offset-2 hover:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        type="button"
        onClick={onOpen}
        data-bg-source="catalog"
        data-has-poster={poster ? 'true' : 'false'}
      >
        {poster ? (
          <img
            className="size-full object-cover"
            src={poster}
            alt=""
            loading="lazy"
            data-bg-source="catalog"
          />
        ) : (
          <span className="grid h-full place-items-center text-[1.4rem] font-bold">{title.slice(0, 2)}</span>
        )}
        {watched ? (
          <span className="absolute top-2 right-2 rounded-full bg-[hsl(142_72%_36%)] px-2 py-1 text-[0.72rem] font-semibold text-white">
            Watched
          </span>
        ) : null}
        {!watched && progress && progress.position > 0 ? (
          <span className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-black/55">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${progressPercent(progress.position, progress.duration)}%` }}
            />
          </span>
        ) : null}
      </button>
      <div className="flex min-w-0 justify-between gap-1">
        <div className="min-w-0">
          <h3 className="m-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[0.95rem] tracking-normal">{title}</h3>
          <p className={cn('mt-1 mb-0 text-[0.82rem] text-muted-foreground')}>
            {[type, release].filter(Boolean).join(' • ')}
          </p>
        </div>
        {action}
      </div>
    </article>
  )
}

function progressPercent(position: number, duration?: number | null) {
  if (!duration || duration <= 0) {
    return 8
  }
  return Math.min(100, Math.max(4, Math.round((position / duration) * 100)))
}
