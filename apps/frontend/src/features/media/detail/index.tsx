import type { MediaPreview } from '@/api/types'

import { MovieDetailPage } from './movie-detail'
import { MediaPlayerPage } from './player'
import { SeriesDetailPage } from './series-detail'
import type { PlaybackTarget, PlayableStream } from './types'

export type { PlaybackTarget, PlayableStream }
export { MediaPlayerPage }

export function MediaDetailPage({
  media,
  listAction,
  preferredVideoId,
  onBack,
  onPlay,
}: {
  media: MediaPreview | null
  listAction?: React.ReactNode
  preferredVideoId?: string | null
  onBack: () => void
  onPlay: (stream: PlayableStream, target: PlaybackTarget) => void
}) {
  if (!media) {
    return null
  }

  if (media.type === 'series') {
    return (
      <SeriesDetailPage
        media={media}
        listAction={listAction}
        preferredVideoId={preferredVideoId}
        onBack={onBack}
        onPlay={onPlay}
      />
    )
  }

  return <MovieDetailPage media={media} listAction={listAction} onBack={onBack} onPlay={onPlay} />
}
