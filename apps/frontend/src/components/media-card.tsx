import type { ListItem, MediaPreview } from '@/api/types'

import { cn } from '@/lib/utils'

type CardMedia = MediaPreview | ListItem

export function MediaCard({
  media,
  onOpen,
  action,
}: {
  media: CardMedia
  onOpen?: () => void
  action?: React.ReactNode
}) {
  const title = 'name' in media ? media.name : media.title
  const type = 'type' in media ? media.type : media.media_type
  const poster = media.poster ?? undefined
  const release = 'name' in media ? media.releaseInfo : media.release_info

  return (
    <article className="media-card-item grid min-w-0 gap-2.5 overflow-hidden">
      <button
        className="aspect-[2/3] w-full cursor-pointer overflow-hidden rounded-lg border border-[hsl(0_0%_100%/8%)] bg-[hsl(240_10%_12%)] text-[hsl(240_6%_70%)] hover:outline-2 hover:outline-offset-2 hover:outline-[hsl(0_0%_100%/70%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(0_0%_100%/70%)]"
        type="button"
        onClick={onOpen}
      >
        {poster ? <img className="size-full object-cover" src={poster} alt="" loading="lazy" /> : <span className="grid h-full place-items-center text-[1.4rem] font-bold">{title.slice(0, 2)}</span>}
      </button>
      <div className="flex min-w-0 justify-between gap-2.5">
        <div className="min-w-0">
          <h3 className="m-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[0.95rem] tracking-normal">{title}</h3>
          <p className={cn('mt-1 mb-0 text-[0.82rem] text-[hsl(240_6%_66%)]')}>{[type, release].filter(Boolean).join(' • ')}</p>
        </div>
        {action}
      </div>
    </article>
  )
}
