import type { MediaPreview } from '@/api/types'

import { DetailShellSkeleton } from './detail-shell'
import { MovieDetailPage } from './movie-detail'
import { SeriesDetailPage } from './series-detail'
import { StreamPlaybackPage } from './stream-playback-page'
import type { PlaybackTarget, PlayableStream } from './types'

export type { PlaybackTarget, PlayableStream }
export { DetailShellSkeleton, StreamPlaybackPage }

export function MediaDetailPage({
  media,
  previousPlayback,
  listAction,
  preferredVideoId,
  preferredSeason,
  onSeriesSelectionChange,
  onBack,
  onPlay,
}: {
  media: MediaPreview | null
  previousPlayback?: { stream: PlayableStream; target: PlaybackTarget } | null
  listAction?: React.ReactNode
  preferredVideoId?: string | null
  preferredSeason?: string
  onSeriesSelectionChange?: (selection: {
    season: number | null
    episodeId: string | null
  }) => void
  onBack: () => void
  onPlay: (stream: PlayableStream, target: PlaybackTarget) => void
}) {
  if (!media) {
    return null
  }

  if (media.type === 'series') {
    return (
      <SeriesDetailPage
        key={media.id}
        media={media}
        previousPlayback={previousPlayback?.target.mediaType === media.type && previousPlayback.target.mediaId === media.id ? previousPlayback : null}
        listAction={listAction}
        preferredVideoId={preferredVideoId}
        preferredSeason={preferredSeason}
        onSelectionChange={onSeriesSelectionChange}
        onBack={onBack}
        onPlay={onPlay}
      />
    )
  }

  return <MovieDetailPage key={`${media.type}:${media.id}`} media={media} preferredStream={previousPlayback?.target.mediaType === media.type && previousPlayback.target.mediaId === media.id && previousPlayback.target.videoId === null ? previousPlayback.stream : undefined} listAction={listAction} onBack={onBack} onPlay={onPlay} />
}
