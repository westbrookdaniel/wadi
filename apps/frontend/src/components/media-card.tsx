import type { ListItem, MediaPreview } from '@/api/types'

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
    <article className="media-card">
      <button className="poster-button" type="button" onClick={onOpen}>
        {poster ? <img src={poster} alt="" loading="lazy" /> : <span>{title.slice(0, 2)}</span>}
      </button>
      <div className="media-card-body">
        <div>
          <h3>{title}</h3>
          <p>{[type, release].filter(Boolean).join(' • ')}</p>
        </div>
        {action}
      </div>
    </article>
  )
}
