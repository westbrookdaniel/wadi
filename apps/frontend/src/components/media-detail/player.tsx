import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'

import { defaultWatchState, findWatchState, queryKeys, updateWatchProgress, watchDataQuery } from '@/api/queries'
import type { MediaPreview, WatchState } from '@/api/types'
import { Button } from '@/components/ui/button'
import { useStreamMetadata } from '@/hooks/use-stream-metadata'
import { stateBlock } from '@/lib/styles'

import type { PlaybackTarget, PlayableStream } from './types'

export function MediaPlayerPage({
  media,
  stream,
  target,
  onBack,
}: {
  media: MediaPreview
  stream: PlayableStream
  target: PlaybackTarget
  onBack: () => void
}) {
  const queryClient = useQueryClient()
  const streamUrl = stream.url
  const metadata = useStreamMetadata(streamUrl)
  const watchData = useQuery(watchDataQuery(target.mediaType, target.mediaId, Boolean(target.mediaType && target.mediaId)))
  const watchState =
    findWatchState(watchData.data, target.videoId) ??
    defaultWatchState(target.mediaType, target.mediaId, target.videoId)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const lastSavedRef = useRef(0)
  const hasRestoredRef = useRef(false)
  const progressMutateRef = useRef<((payload: { position: number; duration?: number | null }) => void) | null>(null)

  const progress = useMutation({
    mutationFn: (payload: { position: number; duration?: number | null }) =>
      updateWatchProgress({
        media_type: target.mediaType,
        media_id: target.mediaId,
        video_id: target.videoId,
        position_seconds: Math.max(0, Math.floor(payload.position)),
        duration_seconds: payload.duration ? Math.floor(payload.duration) : null,
      }),
    onSuccess: (state) => {
      queryClient.setQueryData(queryKeys.watchData(target.mediaType, target.mediaId), (existing: { items?: WatchState[] } | undefined) => {
        if (!existing) {
          return { media_type: target.mediaType, media_id: target.mediaId, items: [state] }
        }
        const items = existing.items ?? []
        const index = items.findIndex((item) => (item.video_id ?? null) === target.videoId)
        return {
          ...existing,
          items: index >= 0 ? items.map((item, itemIndex) => (itemIndex === index ? state : item)) : [...items, state],
        }
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.watchData(target.mediaType, target.mediaId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.continueWatching(20) })
      queryClient.invalidateQueries({ queryKey: queryKeys.continueWatching(12) })
    },
  })

  useEffect(() => {
    progressMutateRef.current = progress.mutate
  }, [progress.mutate])

  const saveCurrentProgress = useCallback(() => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.currentTime)) {
      return
    }
    lastSavedRef.current = video.currentTime
    progressMutateRef.current?.({ position: video.currentTime, duration: finiteDuration(video.duration) })
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const savedPosition = watchState.position_seconds
    if (!video || hasRestoredRef.current || savedPosition <= 0 || watchState.watched) {
      return
    }
    const restore = () => {
      if (!hasRestoredRef.current && Number.isFinite(video.duration)) {
        video.currentTime = Math.min(savedPosition, Math.max(0, video.duration - 3))
        hasRestoredRef.current = true
      }
    }
    if (video.readyState >= 1) {
      restore()
    } else {
      video.addEventListener('loadedmetadata', restore, { once: true })
      return () => video.removeEventListener('loadedmetadata', restore)
    }
  }, [watchState.position_seconds, watchState.watched])

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    const saveThrottled = () => {
      if (Math.abs(video.currentTime - lastSavedRef.current) >= 15) {
        saveCurrentProgress()
      }
    }

    video.addEventListener('timeupdate', saveThrottled)

    return () => {
      saveCurrentProgress()
      video.removeEventListener('timeupdate', saveThrottled)
    }
  }, [saveCurrentProgress])

  return (
    <div className="min-h-svh bg-black">
      <div className="group relative min-h-svh bg-black focus-within:[&_.player-back-button]:translate-y-0 focus-within:[&_.player-back-button]:opacity-100 hover:[&_.player-back-button]:translate-y-0 hover:[&_.player-back-button]:opacity-100">
        <video
          ref={videoRef}
          className="block h-svh w-screen bg-black object-contain"
          src={streamUrl}
          controls
          autoPlay
          playsInline
          poster={media.poster}
          onPause={saveCurrentProgress}
          onSeeked={saveCurrentProgress}
          onEnded={saveCurrentProgress}
        />
        <Button
          variant="ghost"
          size="icon-lg"
          className="player-back-button absolute top-6 left-6 z-[5] grid size-11 -translate-y-1.5 cursor-pointer place-items-center rounded-full border-0 bg-[hsl(0_0%_0%/55%)] text-[hsl(0_0%_98%)] opacity-0 transition-[opacity,transform,background-color] duration-200 hover:bg-[hsl(0_0%_0%/78%)] hover:outline-2 hover:outline-offset-2 hover:outline-[hsl(0_0%_100%/70%)] focus-visible:bg-[hsl(0_0%_0%/78%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(0_0%_100%/70%)] [&_svg]:size-[22px]"
          type="button"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft aria-hidden="true" />
        </Button>
      </div>

      {!streamUrl ? (
        <div className={stateBlock}>
          <strong>This stream cannot play directly</strong>
          <p>Only direct stream URLs can be played in the browser right now.</p>
          {stream.externalUrl ? (
            <Button size="sm" asChild>
              <a href={stream.externalUrl} target="_blank" rel="noreferrer">
                Open external stream
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}

      <span className="absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]" aria-live="polite">
        {metadata.isLoading ? 'Inspecting stream metadata' : null}
        {metadata.data ? `Playing ${media.name}, ${formatDuration(metadata.data.duration)}` : null}
      </span>
    </div>
  )
}

function finiteDuration(duration: number) {
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

function formatDuration(duration: number) {
  if (!Number.isFinite(duration)) {
    return 'Unknown duration'
  }

  const minutes = Math.round(duration / 60)
  return `${minutes} min`
}
