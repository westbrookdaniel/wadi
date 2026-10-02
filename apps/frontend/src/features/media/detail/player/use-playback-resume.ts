import { useQuery } from '@tanstack/react-query'
import { defaultWatchState, findWatchState, watchDataQuery } from '@/api/queries'
import { reconcilePlaybackPosition } from '../playback-session'
import type { PlaybackTarget } from '../types'

export function usePlaybackResume(target: PlaybackTarget) {
  const watchData = useQuery({
    ...watchDataQuery(target.mediaType, target.mediaId, Boolean(target.mediaType && target.mediaId)),
    // A fresh mount can have cached progress from before another device played.
    refetchOnMount: 'always',
  })
  const watchState = findWatchState(watchData.data, target.videoId) ?? defaultWatchState(target.mediaType, target.mediaId, target.videoId)
  return {
    // Both decoders wait for the mount's fetch, even when a cache entry exists.
    // After a failed fetch, permit the local checkpoint/offline fallback.
    ready: watchData.isFetchedAfterMount,
    savedPosition: reconcilePlaybackPosition(target, watchState),
    watched: watchState.watched,
  }
}
