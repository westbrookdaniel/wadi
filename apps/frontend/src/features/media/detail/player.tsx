import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Maximize,
  Pause,
  Play,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import {
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ALL_FORMATS,
  AudioBufferSink,
  CanvasSink,
  Input,
  UrlSource,
  type WrappedAudioBuffer,
  type WrappedCanvas,
} from 'mediabunny'

import { API_BASE_URL } from '@/api/client'
import { defaultWatchState, findWatchState, queryKeys, updateWatchProgress, watchDataQuery } from '@/api/queries'
import type { MediaPreview, WatchState } from '@/api/types'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { stateBlock } from '@/lib/styles'
import { useAppStore } from '@/store/app-store'

import type { PlaybackTarget, PlayableStream } from './types'

type PlayerStatus = 'idle' | 'loading' | 'ready' | 'error'

type PlayerState = {
  status: PlayerStatus
  warning: string | null
  error: string | null
  duration: number
  currentTime: number
  playing: boolean
  volume: number
  muted: boolean
  hasVideo: boolean
  hasAudio: boolean
}

const initialPlayerState: PlayerState = {
  status: 'idle',
  warning: null,
  error: null,
  duration: 0,
  currentTime: 0,
  playing: false,
  volume: 0.7,
  muted: false,
  hasVideo: false,
  hasAudio: false,
}

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
  const token = useAppStore((state) => state.token)
  const proxiedStreamUrl = streamUrl ? buildStreamProxyUrl(streamUrl) : undefined
  const watchData = useQuery(watchDataQuery(target.mediaType, target.mediaId, Boolean(target.mediaType && target.mediaId)))
  const watchState =
    findWatchState(watchData.data, target.videoId) ??
    defaultWatchState(target.mediaType, target.mediaId, target.videoId)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const playerRef = useRef<HTMLDivElement | null>(null)
  const lastSavedRef = useRef(0)
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

  const saveProgress = useCallback((position: number, duration: number) => {
    if (!Number.isFinite(position)) {
      return
    }
    lastSavedRef.current = position
    progressMutateRef.current?.({ position, duration: finiteDuration(duration) })
  }, [])

  const player = useMediabunnyPlayer({
    canvasRef,
    url: proxiedStreamUrl,
    authToken: token,
    savedPosition: watchState.position_seconds,
    watched: watchState.watched,
    onProgressCommit: saveProgress,
  })

  useEffect(() => {
    if (player.state.status !== 'ready') {
      return
    }
    if (Math.abs(player.state.currentTime - lastSavedRef.current) >= 15) {
      saveProgress(player.state.currentTime, player.state.duration)
    }
  }, [player.state.currentTime, player.state.duration, player.state.status, saveProgress])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (player.state.status !== 'ready') {
        return
      }
      if (event.code === 'Space' || event.code === 'KeyK') {
        player.toggle()
      } else if (event.code === 'ArrowLeft') {
        player.seek(Math.max(player.state.currentTime - 5, 0), true)
      } else if (event.code === 'ArrowRight') {
        player.seek(Math.min(player.state.currentTime + 5, player.state.duration), true)
      } else if (event.code === 'KeyM') {
        player.toggleMute()
      } else if (event.code === 'KeyF') {
        toggleFullscreen(playerRef.current)
      } else {
        return
      }
      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [player])

  if (!streamUrl) {
    return (
      <div className="min-h-svh bg-black">
        <div className={cn(stateBlock, 'min-h-svh bg-black px-6')}>
          <strong>This stream cannot play directly</strong>
          <p>Only direct stream URLs can be played in the browser right now.</p>
          {stream.externalUrl ? (
            <Button size="sm" asChild>
              <a href={stream.externalUrl} target="_blank" rel="noreferrer">
                Open external stream
              </a>
            </Button>
          ) : null}
          <Button variant="ghost" size="icon-lg" type="button" onClick={onBack} aria-label="Back">
            <ArrowLeft aria-hidden="true" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="min-h-svh bg-black">
        <div
          ref={playerRef}
          className="group/player relative grid min-h-svh overflow-hidden bg-black text-white focus-within:[&_.player-chrome]:translate-y-0 focus-within:[&_.player-chrome]:opacity-100 hover:[&_.player-chrome]:translate-y-0 hover:[&_.player-chrome]:opacity-100"
          onClick={(event) => {
            if (event.target === event.currentTarget || event.target === canvasRef.current) {
              player.toggle()
            }
          }}
        >
          <canvas
            ref={canvasRef}
            className={cn(
              'm-auto block h-svh w-screen bg-black object-contain',
              !player.state.hasVideo && 'hidden',
            )}
            aria-label={`Playing ${media.name}`}
          />

          {!player.state.hasVideo ? (
            <div className="grid min-h-svh content-center justify-items-center gap-3 px-6 text-center">
              <strong className="text-2xl font-semibold">{media.name}</strong>
              <p className="max-w-[420px] text-sm text-white/68">
                {player.state.hasAudio ? 'Audio stream' : player.state.status === 'loading' ? 'Loading stream' : 'No video track'}
              </p>
            </div>
          ) : null}

          {player.state.status === 'loading' ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/35 text-sm font-medium text-white/80">
              Loading stream
            </div>
          ) : null}

          {player.state.error ? (
            <div className={cn(stateBlock, 'absolute inset-0 min-h-0 bg-black/92 px-6')}>
              <strong>Unable to play this stream</strong>
              <p>{player.state.error}</p>
              {stream.externalUrl ? (
                <Button size="sm" asChild>
                  <a href={stream.externalUrl} target="_blank" rel="noreferrer">
                    Open external stream
                  </a>
                </Button>
              ) : null}
            </div>
          ) : null}

          <PlayerChrome
            playerRef={playerRef}
            mediaName={media.name}
            state={player.state}
            warning={player.state.warning}
            onBack={() => {
              saveProgress(player.state.currentTime, player.state.duration)
              onBack()
            }}
            onTogglePlay={player.toggle}
            onSeek={(seconds) => player.seek(seconds, true)}
            onVolumeChange={player.setVolume}
            onToggleMute={player.toggleMute}
          />

          <span className="absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]" aria-live="polite">
            {player.state.status === 'loading' ? 'Loading stream' : null}
            {player.state.status === 'ready' ? `Playing ${media.name}, ${formatDuration(player.state.duration)}` : null}
            {player.state.error ? `Playback error: ${player.state.error}` : null}
          </span>
        </div>
      </div>
    </TooltipProvider>
  )
}

function buildStreamProxyUrl(streamUrl: string) {
  return `${API_BASE_URL}/api/stream-proxy?url=${encodeURIComponent(streamUrl)}`
}

function PlayerChrome({
  playerRef,
  mediaName,
  state,
  warning,
  onBack,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
}: {
  playerRef: RefObject<HTMLDivElement | null>
  mediaName: string
  state: PlayerState
  warning: string | null
  onBack: () => void
  onTogglePlay: () => void
  onSeek: (seconds: number) => void
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
}) {
  const disabled = state.status !== 'ready'
  const actualVolume = state.muted ? 0 : state.volume
  const VolumeIcon = state.muted || state.volume === 0 ? VolumeX : state.volume < 0.5 ? Volume1 : Volume2

  return (
    <div className="player-chrome pointer-events-none absolute inset-x-0 top-0 bottom-0 z-[5] flex translate-y-1 flex-col justify-between bg-linear-to-b from-black/58 via-transparent to-black/72 opacity-0 transition-[opacity,transform] duration-200">
      <div className="pointer-events-auto flex items-start justify-between gap-3 p-4 sm:p-6">
        <TooltipButton label="Back">
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11 rounded-full border-0 bg-black/55 text-white hover:bg-black/78 focus-visible:bg-black/78 focus-visible:ring-white/30 [&_svg]:size-[22px]"
            type="button"
            onClick={onBack}
            aria-label="Back"
          >
            <ArrowLeft aria-hidden="true" />
          </Button>
        </TooltipButton>

        {warning ? (
          <p className="max-w-[min(520px,60vw)] rounded-md bg-black/62 px-3 py-2 text-right text-xs font-medium text-white/78">
            {warning}
          </p>
        ) : null}
      </div>

      <div className="pointer-events-auto grid gap-3 px-4 pb-4 sm:px-6 sm:pb-6">
        <ProgressScrubber
          label={`Seek ${mediaName}`}
          value={state.currentTime}
          max={state.duration}
          disabled={disabled}
          onChange={onSeek}
        />

        <div className="flex min-h-11 items-center gap-3 rounded-md bg-black/50 px-3 py-2 backdrop-blur-sm max-[620px]:grid max-[620px]:grid-cols-[auto_1fr_auto]">
          <TooltipButton label={state.playing ? 'Pause' : 'Play'}>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-white hover:bg-white/14 focus-visible:ring-white/30"
              type="button"
              onClick={onTogglePlay}
              disabled={disabled}
              aria-label={state.playing ? 'Pause' : 'Play'}
            >
              {state.playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </Button>
          </TooltipButton>

          <span className="min-w-[104px] text-sm font-medium tabular-nums text-white/86 max-[620px]:min-w-0">
            {formatTimestamp(state.currentTime)} / {formatTimestamp(state.duration)}
          </span>

          <div className="flex items-center gap-2 max-[620px]:col-span-3">
            <TooltipButton label={state.muted ? 'Unmute' : 'Mute'}>
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-white hover:bg-white/14 focus-visible:ring-white/30"
                type="button"
                onClick={onToggleMute}
                disabled={disabled || !state.hasAudio}
                aria-label={state.muted ? 'Unmute' : 'Mute'}
              >
                <VolumeIcon aria-hidden="true" />
              </Button>
            </TooltipButton>
            <ProgressScrubber
              label="Volume"
              value={actualVolume}
              max={1}
              disabled={disabled || !state.hasAudio}
              compact
              onChange={onVolumeChange}
            />
          </div>

          <div className="ml-auto max-[620px]:col-start-3 max-[620px]:row-start-1">
            <TooltipButton label="Fullscreen">
              <Button
                variant="ghost"
                size="icon-sm"
                className="rounded-full text-white hover:bg-white/14 focus-visible:ring-white/30"
                type="button"
                onClick={() => toggleFullscreen(playerRef.current)}
                aria-label="Fullscreen"
              >
                <Maximize aria-hidden="true" />
              </Button>
            </TooltipButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function TooltipButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function ProgressScrubber({
  label,
  value,
  max,
  disabled,
  compact = false,
  onChange,
}: {
  label: string
  value: number
  max: number
  disabled: boolean
  compact?: boolean
  onChange: (value: number) => void
}) {
  const progress = max > 0 ? Math.max(0, Math.min(value / max, 1)) : 0

  const commitPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || max <= 0) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const nextProgress = Math.max(0, Math.min((event.clientX - rect.left) / rect.width, 1))
    onChange(nextProgress * max)
  }

  return (
    <div
      className={cn(
        'relative h-5 cursor-pointer touch-none content-center rounded-full',
        compact ? 'w-[120px]' : 'w-full',
        disabled && 'cursor-default opacity-50',
      )}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(value)}
      aria-disabled={disabled}
      onPointerDown={(event) => {
        if (disabled) {
          return
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        commitPointer(event)
      }}
      onPointerMove={(event) => {
        if (event.buttons !== 1) {
          return
        }
        commitPointer(event)
      }}
      onKeyDown={(event) => {
        if (disabled) {
          return
        }
        const step = compact ? 0.05 : 5
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
          onChange(Math.max(value - step, 0))
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
          onChange(Math.min(value + step, max))
        } else {
          return
        }
        event.preventDefault()
      }}
    >
      <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/24" />
      <span
        className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-white"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  )
}

function useMediabunnyPlayer({
  canvasRef,
  url,
  authToken,
  savedPosition,
  watched,
  onProgressCommit,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  url?: string
  authToken: string | null
  savedPosition: number
  watched: boolean
  onProgressCommit: (position: number, duration: number) => void
}) {
  const [state, setState] = useState<PlayerState>(initialPlayerState)
  const stateRef = useRef(initialPlayerState)
  const inputRef = useRef<Input | null>(null)
  const videoSinkRef = useRef<CanvasSink | null>(null)
  const audioSinkRef = useRef<AudioBufferSink | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const videoFrameIteratorRef = useRef<AsyncGenerator<WrappedCanvas, void, unknown> | null>(null)
  const audioBufferIteratorRef = useRef<AsyncGenerator<WrappedAudioBuffer, void, unknown> | null>(null)
  const nextFrameRef = useRef<WrappedCanvas | null>(null)
  const queuedAudioNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set())
  const audioContextStartTimeRef = useRef<number | null>(null)
  const playbackTimeAtStartRef = useRef(0)
  const playingRef = useRef(false)
  const durationRef = useRef(0)
  const savedPositionRef = useRef(savedPosition)
  const watchedRef = useRef(watched)
  const hasRestoredRef = useRef(false)
  const asyncIdRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const renderIntervalRef = useRef<number | null>(null)
  const renderRef = useRef<(requestNextFrame?: boolean) => void>(() => undefined)
  const onProgressCommitRef = useRef(onProgressCommit)

  useEffect(() => {
    onProgressCommitRef.current = onProgressCommit
  }, [onProgressCommit])

  useEffect(() => {
    savedPositionRef.current = savedPosition
    watchedRef.current = watched
  }, [savedPosition, watched])

  const updateState = useCallback((patch: Partial<PlayerState>) => {
    stateRef.current = { ...stateRef.current, ...patch }
    setState(stateRef.current)
  }, [])

  const getPlaybackTime = useCallback(() => {
    if (playingRef.current) {
      const audioContext = audioContextRef.current
      const audioContextStartTime = audioContextStartTimeRef.current
      if (!audioContext || audioContextStartTime === null) {
        return playbackTimeAtStartRef.current
      }
      return audioContext.currentTime - audioContextStartTime + playbackTimeAtStartRef.current
    }
    return playbackTimeAtStartRef.current
  }, [])

  const stopQueuedAudio = useCallback(() => {
    for (const node of queuedAudioNodesRef.current) {
      try {
        node.stop()
      } catch {
        // Already stopped nodes are harmless here.
      }
    }
    queuedAudioNodesRef.current.clear()
  }, [])

  const pause = useCallback((commit = true) => {
    playbackTimeAtStartRef.current = Math.min(getPlaybackTime(), durationRef.current)
    playingRef.current = false
    void audioBufferIteratorRef.current?.return()
    audioBufferIteratorRef.current = null
    stopQueuedAudio()
    updateState({ playing: false, currentTime: playbackTimeAtStartRef.current })
    if (commit) {
      onProgressCommitRef.current(playbackTimeAtStartRef.current, durationRef.current)
    }
  }, [getPlaybackTime, stopQueuedAudio, updateState])

  const drawWrappedCanvas = useCallback((frame: WrappedCanvas) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      return
    }
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(frame.canvas, 0, 0)
  }, [canvasRef])

  const updateNextFrame = useCallback(async () => {
    const currentAsyncId = asyncIdRef.current
    const iterator = videoFrameIteratorRef.current
    if (!iterator) {
      return
    }

    while (currentAsyncId === asyncIdRef.current) {
      const result = await iterator.next()
      const frame = result.value ?? null
      if (!frame) {
        break
      }

      if (currentAsyncId !== asyncIdRef.current) {
        break
      }

      if (frame.timestamp <= getPlaybackTime()) {
        drawWrappedCanvas(frame)
      } else {
        nextFrameRef.current = frame
        break
      }
    }
  }, [drawWrappedCanvas, getPlaybackTime])

  const startVideoIterator = useCallback(async () => {
    const videoSink = videoSinkRef.current
    if (!videoSink) {
      return
    }

    asyncIdRef.current += 1
    await videoFrameIteratorRef.current?.return()
    videoFrameIteratorRef.current = videoSink.canvases(getPlaybackTime())

    const firstFrame = (await videoFrameIteratorRef.current.next()).value ?? null
    const secondFrame = (await videoFrameIteratorRef.current.next()).value ?? null
    nextFrameRef.current = secondFrame
    if (firstFrame) {
      drawWrappedCanvas(firstFrame)
    }
  }, [drawWrappedCanvas, getPlaybackTime])

  const runAudioIterator = useCallback(async () => {
    const audioContext = audioContextRef.current
    const gainNode = gainNodeRef.current
    const iterator = audioBufferIteratorRef.current
    if (!audioContext || !gainNode || !iterator) {
      return
    }

    for await (const { buffer, timestamp } of iterator) {
      if (!playingRef.current) {
        break
      }

      const node = audioContext.createBufferSource()
      node.buffer = buffer
      node.connect(gainNode)
      const startTimestamp = audioContextStartTimeRef.current! + timestamp - playbackTimeAtStartRef.current

      if (startTimestamp >= audioContext.currentTime) {
        node.start(startTimestamp)
      } else {
        node.start(audioContext.currentTime, audioContext.currentTime - startTimestamp)
      }

      queuedAudioNodesRef.current.add(node)
      node.onended = () => {
        queuedAudioNodesRef.current.delete(node)
      }

      if (timestamp - getPlaybackTime() >= 1) {
        await waitUntilNearPlaybackTime(timestamp, getPlaybackTime)
      }
    }
  }, [getPlaybackTime])

  const play = useCallback(async () => {
    if (stateRef.current.status !== 'ready') {
      return
    }

    const audioContext = audioContextRef.current
    if (!audioContext) {
      return
    }

    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }

    if (getPlaybackTime() >= durationRef.current) {
      playbackTimeAtStartRef.current = 0
      await startVideoIterator()
    }

    audioContextStartTimeRef.current = audioContext.currentTime
    playingRef.current = true
    updateState({ playing: true })

    if (audioSinkRef.current) {
      void audioBufferIteratorRef.current?.return()
      audioBufferIteratorRef.current = audioSinkRef.current.buffers(getPlaybackTime())
      void runAudioIterator()
    }
  }, [getPlaybackTime, runAudioIterator, startVideoIterator, updateState])

  const seek = useCallback(async (seconds: number, commit = false) => {
    if (stateRef.current.status !== 'ready') {
      return
    }

    const nextTime = Math.max(0, Math.min(seconds, durationRef.current))
    const wasPlaying = playingRef.current
    if (wasPlaying) {
      pause(false)
    }

    playbackTimeAtStartRef.current = nextTime
    updateState({ currentTime: nextTime })
    await startVideoIterator()

    if (commit) {
      onProgressCommitRef.current(nextTime, durationRef.current)
    }

    if (wasPlaying && nextTime < durationRef.current) {
      void play()
    }
  }, [pause, play, startVideoIterator, updateState])

  const render = useCallback((requestNextFrame = true) => {
    if (stateRef.current.status === 'ready') {
      const playbackTime = Math.min(getPlaybackTime(), durationRef.current)
      if (playingRef.current && playbackTime >= durationRef.current) {
        pause(true)
        playbackTimeAtStartRef.current = durationRef.current
      }

      const nextFrame = nextFrameRef.current
      if (nextFrame && nextFrame.timestamp <= playbackTime) {
        drawWrappedCanvas(nextFrame)
        nextFrameRef.current = null
        void updateNextFrame()
      }

      updateState({ currentTime: playbackTime })
    }

    if (requestNextFrame) {
      animationFrameRef.current = requestAnimationFrame(() => renderRef.current())
    }
  }, [drawWrappedCanvas, getPlaybackTime, pause, updateNextFrame, updateState])

  useEffect(() => {
    renderRef.current = render
  }, [render])

  const dispose = useCallback((commit = true) => {
    if (commit && stateRef.current.status === 'ready') {
      onProgressCommitRef.current(getPlaybackTime(), durationRef.current)
    }

    asyncIdRef.current += 1
    playingRef.current = false
    void videoFrameIteratorRef.current?.return()
    void audioBufferIteratorRef.current?.return()
    videoFrameIteratorRef.current = null
    audioBufferIteratorRef.current = null
    nextFrameRef.current = null
    stopQueuedAudio()
    inputRef.current?.dispose()
    inputRef.current = null
    videoSinkRef.current = null
    audioSinkRef.current = null
    void audioContextRef.current?.close()
    audioContextRef.current = null
    gainNodeRef.current = null

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (renderIntervalRef.current !== null) {
      clearInterval(renderIntervalRef.current)
      renderIntervalRef.current = null
    }
  }, [getPlaybackTime, stopQueuedAudio])

  useEffect(() => {
    if (!url) {
      updateState(initialPlayerState)
      return
    }

    let canceled = false

    const init = async () => {
      dispose(false)
      stateRef.current = { ...initialPlayerState, status: 'loading' }
      setState(stateRef.current)

      try {
        const input = new Input({
          formats: ALL_FORMATS,
          source: new UrlSource(url, {
            requestInit: {
              headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
            },
          }),
        })
        inputRef.current = input

        const [duration, videoTrackResult, audioTrackResult] = await Promise.all([
          input.computeDuration(),
          input.getPrimaryVideoTrack(),
          input.getPrimaryAudioTrack(),
        ])
        let videoTrack = videoTrackResult
        let audioTrack = audioTrackResult
        let warning = ''

        if (videoTrack) {
          if (videoTrack.codec === null) {
            warning += 'Unsupported video codec. '
            videoTrack = null
          } else if (!(await videoTrack.canDecode())) {
            warning += 'Unable to decode the video track. '
            videoTrack = null
          }
        }

        if (audioTrack) {
          if (audioTrack.codec === null) {
            warning += 'Unsupported audio codec. '
            audioTrack = null
          } else if (!(await audioTrack.canDecode())) {
            warning += 'Unable to decode the audio track. '
            audioTrack = null
          }
        }

        if (!videoTrack && !audioTrack) {
          throw new Error(warning || 'No audio or video track found.')
        }

        if (canceled) {
          input.dispose()
          return
        }

        const AudioContextConstructor = getAudioContextConstructor()
        const audioContext = audioTrack
          ? new AudioContextConstructor({ sampleRate: audioTrack.sampleRate })
          : new AudioContextConstructor()
        const gainNode = audioContext.createGain()
        gainNode.connect(audioContext.destination)
        audioContextRef.current = audioContext
        gainNodeRef.current = gainNode

        const videoCanBeTransparent = videoTrack ? await videoTrack.canBeTransparent() : false
        videoSinkRef.current = videoTrack
          ? new CanvasSink(videoTrack, { poolSize: 2, fit: 'contain', alpha: videoCanBeTransparent })
          : null
        audioSinkRef.current = audioTrack ? new AudioBufferSink(audioTrack) : null
        durationRef.current = duration

        const canvas = canvasRef.current
        if (canvas && videoTrack) {
          canvas.width = videoTrack.displayWidth
          canvas.height = videoTrack.displayHeight
        }

        const restoredTime = savedPositionRef.current > 0 && !watchedRef.current
          ? Math.min(savedPositionRef.current, Math.max(0, duration - 3))
          : 0
        playbackTimeAtStartRef.current = restoredTime
        hasRestoredRef.current = restoredTime > 0
        playingRef.current = false
        setGain(gainNode, stateRef.current.volume, stateRef.current.muted)
        updateState({
          status: 'ready',
          warning: warning || null,
          error: null,
          duration,
          currentTime: restoredTime,
          playing: false,
          hasVideo: Boolean(videoTrack),
          hasAudio: Boolean(audioTrack),
        })
        await startVideoIterator()

        animationFrameRef.current = requestAnimationFrame(() => render())
        renderIntervalRef.current = window.setInterval(() => render(false), 500)

        if (audioContext.state === 'running') {
          void play()
        }
      } catch (error) {
        if (canceled) {
          return
        }
        console.error(error)
        dispose(false)
        updateState({
          ...initialPlayerState,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    void init()

    return () => {
      canceled = true
      dispose(true)
    }
  }, [authToken, canvasRef, dispose, play, render, startVideoIterator, updateState, url])

  useEffect(() => {
    if (state.status !== 'ready' || hasRestoredRef.current || savedPosition <= 0 || watched) {
      return
    }

    hasRestoredRef.current = true
    void seek(Math.min(savedPosition, Math.max(0, state.duration - 3)), false)
  }, [savedPosition, seek, state.duration, state.status, watched])

  const setVolume = useCallback((volume: number) => {
    const nextVolume = Math.max(0, Math.min(volume, 1))
    const nextMuted = nextVolume === 0
    setGain(gainNodeRef.current, nextVolume, nextMuted)
    updateState({ volume: nextVolume, muted: nextMuted })
  }, [updateState])

  const toggleMute = useCallback(() => {
    const muted = !stateRef.current.muted
    setGain(gainNodeRef.current, stateRef.current.volume, muted)
    updateState({ muted })
  }, [updateState])

  const toggle = useCallback(() => {
    if (playingRef.current) {
      pause(true)
    } else {
      void play()
    }
  }, [pause, play])

  return useMemo(() => ({
    state,
    play,
    pause,
    seek,
    setVolume,
    toggleMute,
    toggle,
  }), [pause, play, seek, setVolume, state, toggle, toggleMute])
}

function setGain(gainNode: GainNode | null, volume: number, muted: boolean) {
  if (!gainNode) {
    return
  }
  const actualVolume = muted ? 0 : volume
  gainNode.gain.value = actualVolume ** 2
}

async function waitUntilNearPlaybackTime(timestamp: number, getPlaybackTime: () => number) {
  while (timestamp - getPlaybackTime() >= 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 100))
  }
}

function getAudioContextConstructor() {
  const webkitWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext
  }
  return window.AudioContext ?? webkitWindow.webkitAudioContext!
}

function toggleFullscreen(element: HTMLElement | null) {
  if (!element) {
    return
  }
  if (document.fullscreenElement) {
    void document.exitFullscreen()
  } else {
    void element.requestFullscreen()
  }
}

function finiteDuration(duration: number) {
  return Number.isFinite(duration) && duration > 0 ? duration : null
}

function formatTimestamp(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00'
  }

  const rounded = Math.floor(seconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const remainingSeconds = rounded % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function formatDuration(duration: number) {
  if (!Number.isFinite(duration)) {
    return 'Unknown duration'
  }

  const minutes = Math.round(duration / 60)
  return `${minutes} min`
}
