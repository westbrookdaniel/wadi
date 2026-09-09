import { useQuery } from '@tanstack/react-query'

import { defaultWatchState, findWatchState, streamsQuery, watchDataQuery } from '@/api/queries'
import type { MediaPreview } from '@/api/types'

import { DetailShell } from './detail-shell'
import { StreamList } from './stream-list'
import type { PlaybackTarget, PlayableStream } from './types'
import { useWatchToggle } from './use-watch-toggle'
import { WatchedButton } from './watch-state'

export function MovieDetailPage({
  media,
  listAction,
  onBack,
  onPlay,
}: {
  media: MediaPreview
  listAction?: React.ReactNode
  onBack: () => void
  onPlay: (stream: PlayableStream, target: PlaybackTarget) => void
}) {
  const streams = useQuery(streamsQuery(media.type, media.id, Boolean(media)))
  const watchData = useQuery(watchDataQuery(media.type, media.id, Boolean(media)))
  const watchState = findWatchState(watchData.data, null) ?? defaultWatchState(media.type, media.id, null)
  const toggleWatched = useWatchToggle(media.type, media.id, null)

  return (
    <DetailShell
      media={media}
      onBack={onBack}
      sideLabel="Available streams"
      sideTitle="Streams"
      sideContent={
        <StreamList
          streams={streams.data ?? []}
          isLoading={streams.isLoading}
          onPlay={(stream) =>
            onPlay(stream, {
              mediaType: media.type,
              mediaId: media.id,
              overrideMediaId: media.id,
              videoId: null,
              episodeContext: null,
            })
          }
        />
      }
    >
      <div className="flex flex-wrap items-start gap-2">
      {media.type === 'movie' ? (
        <WatchedButton
          watched={watchState.watched}
          isPending={toggleWatched.isPending || watchData.isLoading || watchData.isError}
          onClick={() => toggleWatched.mutate(!watchState.watched)}
        />
      ) : null}
      {listAction}
      </div>
      {toggleWatched.error || watchData.error || streams.error ? <p role="alert" className="text-xs text-destructive">{(toggleWatched.error ?? watchData.error ?? streams.error)?.message}</p> : null}
    </DetailShell>
  )
}
