import { useEpisodeAutoplay } from './use-episode-autoplay'
import { useAutoPlayback } from '@/store/auto-playback'
import { nextReleasedEpisode, rankStreams, isDirectStream } from '../auto-pick'
import { NextEpisodePrompt } from './next-episode-prompt'
import { StreamList } from '../stream-list'
import { episodesQuery } from '@/api/queries'
import { useDesktopPlayer } from './use-desktop-player'
import { desktopBridge } from '@/lib/desktop'
import { DesktopDownload } from '@/components/desktop-download'
import { openExternalPlayback } from '../external-players'
import { playbackPreferencesQuery } from '@/api/queries'
import { normalizePlaybackPreferences } from '../stream-playback'
import { useDeviceStore } from '@/store/device-store'
import { RevealedImage } from '@/components/revealed-image'
import { Artwork } from '@/components/artwork'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Cast,
  Captions,
  ChevronLeft,
  ChevronRight,
  Languages,
  Maximize,
  Pause,
  Play,
  Settings2,
  Timer,
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
  type InputAudioTrack,
  UrlSource,
  type WrappedAudioBuffer,
  type WrappedCanvas,
} from 'mediabunny'

import {
  defaultWatchState,
  findWatchState,
  queryKeys,
  type SubtitleQueryContext,
  streamsQuery,
  subtitlesQuery,
  updateWatchProgress,
  watchDataQuery,
} from '@/api/queries'
import type { MediaPreview, WatchState } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { stateBlock } from '@/lib/styles'
import { useAppStore } from '@/store/app-store'

import { formatEpisodeReleaseDate, saveLastSeason } from '../series-url-state'
import { getChromecastTransport } from '../chromecast'
import { buildStreamProxyUrl, buildSubtitleProxyUrl } from '../stream-playback'
import type { Episode, PlaybackTarget, PlayableStream } from '../types'
import { readSubtitleChoice, saveSubtitleChoice, readPlaybackPosition, savePlaybackPosition } from '../playback-session'
import { defaultSubtitleForAudio, languageName, normalizeLanguage, mergeSubtitleTracks, parseSubtitleText, type SubtitleCue } from './subtitle-utils'
import { usePlayerKeyboardShortcuts } from './use-player-keyboard-shortcuts'
import { usePlayerPreferences } from './use-player-preferences'
import { canControlPlayback, initialPlayerState, type CastStateData, type PlayerState } from './state'

export function MediaPlayerPage({
  media,
  stream,
  target,
  onBack,
  onPlaybackChange,
}: {
  onPlaybackChange?: (stream: PlayableStream, target: PlaybackTarget) => void
  media: MediaPreview
  stream: PlayableStream
  target: PlaybackTarget
  onBack: () => void
}) {
  const autoSettings = useAutoPlayback(state => state.settings)
  const profileId = useAppStore(state => state.activeProfileId)
  const releaseCatalog = useQuery({ ...episodesQuery(target.mediaId, profileId), enabled: target.mediaType === "series" && Boolean(profileId) })
  const [upNext, setUpNext] = useState<Episode | null>(null)
  const tvMode = useDeviceStore(state => state.tvMode)
  const queryClient = useQueryClient()
  const [activeStream, setActiveStream] = useState(stream)
  const [activeTarget, setActiveTarget] = useState(target)
  const streamUrl = activeStream.url
  const token = useAppStore((state) => state.token)
  const externalPreferences = useQuery(playbackPreferencesQuery)
  const desktop = desktopBridge()
  const conversionEnabled = useDeviceStore(state => state.conversionEnabled)
  const proxiedStreamUrl = desktop ? undefined : streamUrl ? buildStreamProxyUrl(streamUrl) : undefined
  const watchData = useQuery(
    watchDataQuery(
      activeTarget.mediaType,
      activeTarget.mediaId,
      Boolean(activeTarget.mediaType && activeTarget.mediaId),
    ),
  )
  const watchState =
    findWatchState(watchData.data, activeTarget.videoId) ??
    defaultWatchState(activeTarget.mediaType, activeTarget.mediaId, activeTarget.videoId)
  const subtitleRequestId = activeTarget.videoId ?? activeTarget.mediaId
  const subtitleQueryContext = useMemo<SubtitleQueryContext>(() => {
    const behaviorHints = activeStream.behaviorHints && typeof activeStream.behaviorHints === 'object'
      ? activeStream.behaviorHints
      : undefined
    return {
      videoId: activeTarget.videoId,
      videoHash: typeof behaviorHints?.videoHash === 'string' ? behaviorHints.videoHash : null,
      videoSize: Number.isFinite(behaviorHints?.videoSize)
        ? Number(behaviorHints?.videoSize)
        : null,
      filename: typeof behaviorHints?.filename === 'string' ? behaviorHints.filename : null,
    }
  }, [activeStream.behaviorHints, activeTarget.videoId])
  const subtitleTracks = useQuery(
    subtitlesQuery(activeTarget.mediaType, subtitleRequestId, {
      enabled: Boolean(activeTarget.mediaType && subtitleRequestId),
      context: subtitleQueryContext,
    }),
  )
  const overrideMediaId = activeTarget.overrideMediaId ?? activeTarget.mediaId
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const playerRef = useRef<HTMLDivElement | null>(null)
  const lastSavedRef = useRef(0)
  const progressMutateRef = useRef<((payload: { position: number; duration?: number | null }) => void) | null>(null)
  const castTransport = useMemo(() => getChromecastTransport(), [])
  const [castConnected, setCastConnected] = useState(false)
  const [castReady, setCastReady] = useState(false)
  const [castUnavailableReason, setCastUnavailableReason] = useState<string | null>(null)
  const castStartPosition = useRef(0)
  const [castState, setCastState] = useState<CastStateData>({})
  const [episodeSheetOpen, setEpisodeSheetOpen] = useState(false)
  const [selectedSwapSeason, setSelectedSwapSeason] = useState<number | null>(activeTarget.episodeContext?.season ?? null)
  const [pendingEpisode, setPendingEpisode] = useState<Episode | null>(null)
  const episodeStreams = useQuery(
    streamsQuery(
      activeTarget.mediaType,
      pendingEpisode?.id ?? "",
      Boolean(pendingEpisode),
    ),
  )



  const lastSentCastPropsRef = useRef<string | null>(null)
  const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([])
  const [subtitleDebugError, setSubtitleDebugError] = useState<string | null>(null)

  const streamSubtitleList = useMemo(
    () => mergeSubtitleTracks(
      activeStream.subtitles,
      'Stream',
      (subtitleTracks.data ?? []).map((track) => ({
        ...track,
        source: 'Addon',
      })),
    ),
    [activeStream.subtitles, subtitleTracks.data],
  )

  const { playbackState, updatePlaybackState } = usePlayerPreferences({
    mediaType: activeTarget.mediaType,
    overrideMediaId,
    streamSubtitleList,
    streamSubtitlesLoading: subtitleTracks.isLoading,
  })

  const progress = useMutation({
    mutationFn: (payload: { position: number; duration?: number | null }) =>
      updateWatchProgress({
        media_type: activeTarget.mediaType,
        media_id: activeTarget.mediaId,
        video_id: activeTarget.videoId,
        ignore_start_seconds: autoSettings.ignoreStartSeconds,
        finish_remaining_seconds: autoSettings.finishRemainingSeconds,
        position_seconds: Math.max(0, Math.floor(payload.position)),
        duration_seconds: payload.duration ? Math.floor(payload.duration) : null,
      }),
    onSuccess: (state) => {
      queryClient.setQueryData(queryKeys.watchData(activeTarget.mediaType, activeTarget.mediaId), (existing: { items?: WatchState[] } | undefined) => {
        if (!existing) {
          return { media_type: activeTarget.mediaType, media_id: activeTarget.mediaId, items: [state] }
        }
        const items = existing.items ?? []
        const index = items.findIndex((item) => (item.video_id ?? null) === activeTarget.videoId)
        return {
          ...existing,
          items: index >= 0 ? items.map((item, itemIndex) => (itemIndex === index ? state : item)) : [...items, state],
        }
      })
      queryClient.invalidateQueries({ queryKey: ['episodes', activeTarget.mediaId] })
      queryClient.invalidateQueries({ queryKey: queryKeys.watchData(activeTarget.mediaType, activeTarget.mediaId) })
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
    savePlaybackPosition(activeTarget, position)
    lastSavedRef.current = position
    progressMutateRef.current?.({ position, duration: finiteDuration(duration) })
  }, [activeTarget])

  const nextEpisode = nextReleasedEpisode(releaseCatalog.data?.items ?? activeTarget.seriesEpisodes ?? [], activeTarget.videoId)
  const promptNextEpisode = useCallback(() => { if (nextEpisode) setUpNext(nextEpisode) }, [nextEpisode])
  const endedRef = useRef<(() => void) | null>(null)
  const onEnded = useCallback(() => endedRef.current?.(), [])
  const webPlayer = useMediabunnyPlayer({
    canvasRef,
    url: proxiedStreamUrl,
    authToken: null,
    savedPosition: readPlaybackPosition(activeTarget) ?? watchState.position_seconds,
    watched: watchState.watched,
    preferredAudioLanguage: playbackState.preferredAudioLanguage,
    selectedAudioTrackId: playbackState.selectedAudioTrackId,
    initialPlaybackSpeed: playbackState.playbackSpeed,
    onProgressCommit: saveProgress,
    onEnded,
  })

  const desktopPlayer = useDesktopPlayer({ videoRef, source: desktop && !watchData.isLoading ? streamUrl : undefined, hints: activeStream.behaviorHints, savedPosition: readPlaybackPosition(activeTarget) ?? watchState.position_seconds, watched: watchState.watched, onProgressCommit: saveProgress, onEnded })
  const player = desktop ? desktopPlayer : webPlayer
  const triggerNextEpisode = useEpisodeAutoplay({
    episodeKey: `${activeTarget.mediaType}:${activeTarget.mediaId}:${activeTarget.videoId}`,
    enabled: autoSettings.autoplayNext && !!nextEpisode && !castConnected && externalPreferences.data?.stream_action === 'internal',
    playing: player.state.status === 'ready' && player.state.playing,
    currentTime: player.state.currentTime,
    duration: player.state.duration,
    leadSeconds: autoSettings.nextEpisodeLeadSeconds,
    onPrompt: promptNextEpisode,
  })
  useEffect(() => { endedRef.current = triggerNextEpisode }, [triggerNextEpisode])

  const [controlsVisible, setControlsVisible] = useState(true)
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const revealControls = useCallback(() => {
    setControlsVisible(true)
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
    hideControlsTimer.current = setTimeout(() => setControlsVisible(false), 2800)
  }, [])
  useEffect(() => () => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current) }, [])
  const checkpointSecond = Math.floor(player.state.currentTime)
  useEffect(() => {
    if (player.state.status === 'ready') savePlaybackPosition(activeTarget, checkpointSecond)
  }, [activeTarget, checkpointSecond, player.state.status])
  const automaticAudioRef = useRef<string | null>(null)
  const manualSubtitleRef = useRef(false)
  useEffect(() => {
    const audio = player.state.audioTracks.find(track => track.id === player.state.selectedAudioTrackId)
    if (!audio || subtitleTracks.isLoading || player.state.status !== 'ready' || automaticAudioRef.current === audio.id) return
    automaticAudioRef.current = audio.id
    if (manualSubtitleRef.current) return
    const savedChoice = readSubtitleChoice(activeTarget)
    const savedTrack = savedChoice?.language ? streamSubtitleList.find(track => track.id === savedChoice.id) ?? streamSubtitleList.find(track => normalizeLanguage(track.language) === normalizeLanguage(savedChoice.language ?? '')) : undefined
    const id = savedChoice ? savedTrack?.id ?? null : defaultSubtitleForAudio(audio.language, streamSubtitleList)
    updatePlaybackState({ subtitlesEnabled: id !== null, selectedSubtitleId: id, preferredSubtitleLanguage: id ? streamSubtitleList.find(track => track.id === id)?.language ?? 'eng' : null })
  }, [activeTarget, player.state.audioTracks, player.state.selectedAudioTrackId, player.state.status, streamSubtitleList, subtitleTracks.isLoading, updatePlaybackState])

  const { setPlaybackSpeed, setAudioTrack, pause: pauseLocal } = player
  useEffect(() => {
    setPlaybackSpeed(playbackState.playbackSpeed)
  }, [setPlaybackSpeed, playbackState.playbackSpeed])

  useEffect(() => {
    if (!playbackState.selectedAudioTrackId) {
      return
    }
    setAudioTrack(playbackState.selectedAudioTrackId)
  }, [setAudioTrack, playbackState.selectedAudioTrackId])

  useEffect(() => {
    const receiverAppId = process.env.NEXT_PUBLIC_CHROMECAST_RECEIVER_APP_ID || 'CC1AD845'
    let alive = true
    castTransport
      .setOptions(receiverAppId)
      .then(() => {
        if (alive) {
          setCastReady(true)
          setCastUnavailableReason(null)
        }
      })
      .catch(() => {
        if (alive) {
          setCastReady(false)
          setCastUnavailableReason("Unable to initialize Chromecast")
        }
      })
    const onCastStateChanged = () => {
      const value = castTransport.getCastState()
      setCastConnected(value === window.cast?.framework?.CastState?.CONNECTED)
    }
    const onMessage = (message: unknown) => {
      if (!message || typeof message !== "object" || !("event" in message)) {
        return
      }
      const castMessage = message as { event: string; args?: unknown[] }
      if (castMessage.event === "propChanged" || castMessage.event === "propValue") {
        const [name, value] = castMessage.args ?? []
        if (typeof name === "string") {
          setCastState((current) => ({ ...current, [name]: value } as CastStateData))
        }
      }
    }
    castTransport.on("cast_state_changed", onCastStateChanged)
    castTransport.on("message", onMessage)
    onCastStateChanged()
    return () => {
      alive = false
      castTransport.off("cast_state_changed", onCastStateChanged)
      castTransport.off("message", onMessage)
    }
  }, [castTransport])

  useEffect(() => {
    if (!castConnected || !activeStream.url) {
      return
    }
    const tracks = streamSubtitleList.map((track) => ({
      id: track.id,
      lang: track.language,
      url: track.url,
    }))
    void castTransport.sendMessage({
      type: "command",
      commandName: "load",
      commandArgs: {
        stream: {
          url: activeStream.url,
          subtitles: tracks,
        },
        autoplay: true,
        time: castStartPosition.current,
      },
    }).then(() => pauseLocal()).catch((error: unknown) => {
      setCastUnavailableReason(error instanceof Error ? error.message : "Unable to cast this stream")
      castTransport.endCurrentSession()
    })
    const propsToObserve = [
      "stream",
      "loaded",
      "paused",
      "time",
      "duration",
      "volume",
      "muted",
      "playbackSpeed",
      "selectedSubtitlesTrackId",
      "selectedAudioTrackId",
    ]
    propsToObserve.forEach((propName) => {
      void castTransport.sendMessage({ type: "observeProp", propName })
    })
  }, [activeStream.url, castConnected, castTransport, pauseLocal, streamSubtitleList])

  useEffect(() => {
    if (!castConnected) {
      lastSentCastPropsRef.current = null
      return
    }
    const castProps = {
      playbackSpeed: playbackState.playbackSpeed,
      selectedSubtitlesTrackId: playbackState.selectedSubtitleId,
      selectedAudioTrackId: playbackState.selectedAudioTrackId,
    }
    const serialized = JSON.stringify(castProps)
    if (serialized === lastSentCastPropsRef.current) {
      return
    }
    lastSentCastPropsRef.current = serialized
    void castTransport.sendMessage({
      type: "setProp",
      propName: "playbackSpeed",
      propValue: castProps.playbackSpeed,
    })
    void castTransport.sendMessage({
      type: "setProp",
      propName: "selectedSubtitlesTrackId",
      propValue: castProps.selectedSubtitlesTrackId,
    })
    void castTransport.sendMessage({
      type: "setProp",
      propName: "selectedAudioTrackId",
      propValue: castProps.selectedAudioTrackId,
    })
  }, [
    castConnected,
    castTransport,
    playbackState.playbackSpeed,
    playbackState.selectedAudioTrackId,
    playbackState.selectedSubtitleId,
  ])

  const activeSubtitleTrack = useMemo(
    () => streamSubtitleList.find((track) => track.id === playbackState.selectedSubtitleId),
    [playbackState.selectedSubtitleId, streamSubtitleList],
  )

  useEffect(() => {
    let cancelled = false
    if (!activeSubtitleTrack) {
      // Clear captions when the selected external track changes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSubtitleCues([])
      setSubtitleDebugError(null)
      return
    }
    void buildSubtitleProxyUrl(activeSubtitleTrack.url).then(url => fetch(url))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`subtitle proxy request failed with ${response.status}`)
        }
        return response.text()
      })
      .then((text) => {
        if (cancelled) {
          return
        }
        const cues = parseSubtitleText(text)
        if (!cues.length && text.trim()) {
          console.warn('[subtitles] parsed zero cues')
          setSubtitleDebugError('Subtitle track loaded but no cues were parsed')
        } else {
          setSubtitleDebugError(null)
        }
        setSubtitleCues(cues)
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('[subtitles] failed to load subtitle track', {
            subtitleUrl: activeSubtitleTrack.url,
            error,
          })
          setSubtitleCues([])
          setSubtitleDebugError('Failed to load subtitle track')
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeSubtitleTrack, token])

  const subtitleText = useMemo(() => {
    if (!playbackState.selectedSubtitleId || !subtitleCues.length) {
      return ""
    }
    const baseTime = castConnected
      ? Number(castState.currentTime ?? 0)
      : player.state.currentTime
    const time = baseTime - playbackState.subtitleDelay
    return subtitleCues.filter(candidate => time >= candidate.start && time < candidate.end).map(cue => cue.text).join("\n")
  }, [
    castConnected,
    castState.currentTime,
    playbackState.subtitleDelay,
    playbackState.selectedSubtitleId,
    player.state.currentTime,
    subtitleCues,
  ])

  const changeEpisode = useCallback((nextStream: PlayableStream) => {
    if (!pendingEpisode) return
    const nextTarget = { ...activeTarget, videoId: pendingEpisode.id, seriesEpisodes: releaseCatalog.data?.items ?? activeTarget.seriesEpisodes, episodeContext: { season: pendingEpisode.season, episode: pendingEpisode.episode, title: pendingEpisode.title } }
    saveProgress(player.state.currentTime, player.state.duration)
    if (onPlaybackChange) onPlaybackChange(nextStream, nextTarget)
    else { setActiveTarget(nextTarget); setActiveStream(nextStream) }
    setPendingEpisode(null)
    setUpNext(null)
    setEpisodeSheetOpen(false)
  }, [pendingEpisode, activeTarget, releaseCatalog.data, saveProgress, player.state.currentTime, player.state.duration, onPlaybackChange])
  useEffect(() => {
    if (!pendingEpisode || episodeStreams.isFetching || episodeStreams.error || !episodeStreams.data) return
    const next = autoSettings.enabled ? rankStreams(episodeStreams.data, autoSettings).find(row => row.eligible)?.stream : episodeStreams.data.find(isDirectStream)
    // Completing the provider request transitions the external player and its episode state together.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (next && externalPreferences.data?.stream_action === 'internal') changeEpisode(next)
  }, [pendingEpisode, episodeStreams.data, episodeStreams.isFetching, episodeStreams.error, autoSettings, externalPreferences.data, changeEpisode])

  const onTogglePlay = useCallback(() => {
    setUpNext(null)
    if (castConnected) {
      const paused = !(castState.paused === true)
      void castTransport.sendMessage({ type: "setProp", propName: "paused", propValue: paused })
      return
    }
    player.toggle()
  }, [castConnected, castState.paused, castTransport, player])

  const onSeek = useCallback((seconds: number) => {
    setUpNext(null)
    if (castConnected) {
      void castTransport.sendMessage({ type: "setProp", propName: "time", propValue: seconds })
      return
    }
    player.seek(seconds, true)
  }, [castConnected, castTransport, player])

  const onVolume = useCallback((volume: number) => {
    if (castConnected) {
      void castTransport.sendMessage({ type: "setProp", propName: "volume", propValue: volume })
      return
    }
    player.setVolume(volume)
  }, [castConnected, castTransport, player])

  const onToggleMute = useCallback(() => {
    if (castConnected) {
      const muted = !(castState.muted === true)
      void castTransport.sendMessage({ type: "setProp", propName: "muted", propValue: muted })
      return
    }
    player.toggleMute()
  }, [castConnected, castState.muted, castTransport, player])

  const onChangeSpeed = useCallback((speed: number) => {
    updatePlaybackState({ playbackSpeed: speed })
    if (castConnected) {
      void castTransport.sendMessage({ type: "setProp", propName: "playbackSpeed", propValue: speed })
      return
    }
    player.setPlaybackSpeed(speed)
  }, [castConnected, castTransport, player, updatePlaybackState])

  const effectiveState: PlayerState = castConnected
    ? {
      ...player.state,
      currentTime: Number(castState.currentTime ?? player.state.currentTime),
      duration: Number(castState.duration ?? player.state.duration),
      muted: Boolean(castState.muted ?? player.state.muted),
      volume: Number(castState.volume ?? player.state.volume),
      playing:
          castState.paused === undefined
            ? player.state.playing
            : !(castState.paused as boolean),
      playbackSpeed: Number(castState.playbackSpeed ?? player.state.playbackSpeed),
      selectedAudioTrackId:
          (castState.selectedAudioTrackId as string | null | undefined) ?? player.state.selectedAudioTrackId,
    }
    : player.state

  useEffect(() => {
    if (effectiveState.status !== 'ready') {
      return
    }
    if (Math.abs(effectiveState.currentTime - lastSavedRef.current) >= 15) {
      saveProgress(effectiveState.currentTime, effectiveState.duration)
    }
  }, [effectiveState.currentTime, effectiveState.duration, effectiveState.status, saveProgress])

  usePlayerKeyboardShortcuts(
    {
      status: effectiveState.status,
      currentTime: effectiveState.currentTime,
      duration: effectiveState.duration,
      playbackSpeed: playbackState.playbackSpeed,
      volume: effectiveState.muted ? 0 : effectiveState.volume,
    },
    {
      onTogglePlay,
      onSeek,
      onToggleMute,
      onVolumeChange: onVolume,
      onChangeSpeed,
      onToggleFullscreen: () => toggleFullscreen(playerRef.current),
    },
  )

  if (!streamUrl) {
    return (
      <div className="min-h-dvh bg-black">
        <div className={cn(stateBlock, 'min-h-dvh bg-black px-6')}>
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
      <div className="min-h-dvh bg-black">
        <div
          ref={playerRef}
          className="dark player-viewport group/player relative grid h-dvh overflow-hidden bg-black text-white"
          onPointerMove={revealControls}
          onPointerDown={revealControls}
          onClick={(event) => {
            if (event.target === event.currentTarget || event.target === canvasRef.current || event.target === videoRef.current) {
              player.toggle()
            }
          }}
        >
          {desktop ? <video ref={videoRef} playsInline className="m-auto block h-dvh w-screen bg-black object-contain" aria-label={`Playing ${media.name}`} /> : <canvas
            ref={canvasRef}
            className={cn(
              'm-auto block h-dvh w-screen bg-black object-contain',
              !player.state.hasVideo && 'hidden',
            )}
            aria-label={`Playing ${media.name}`}
          />}

          {(player.state.status === 'loading' || player.state.status === 'idle') && !player.state.error ? (
            <div className="player-loading pointer-events-none absolute inset-0 z-[4] grid place-content-center justify-items-center gap-6 bg-black text-center" role="status" aria-label="Loading stream">
              {typeof media.raw.logo === 'string' && media.raw.logo ? <RevealedImage className="player-loading-mark max-h-36 w-[min(55vw,360px)] object-contain" src={media.raw.logo} alt={media.name} /> : <strong className="player-loading-mark max-w-[70vw] text-2xl font-medium tracking-tight">{media.name}</strong>}

            </div>
          ) : !player.state.hasVideo && !player.state.error ? (
            <div className="absolute inset-0 grid place-content-center text-center"><strong>{media.name}</strong><p className="text-white/50">Audio playback</p></div>
          ) : null}

          {player.state.error ? (
            <div className={cn(stateBlock, 'absolute inset-0 min-h-0 bg-black/92 px-6')}>
              <strong>Unable to play this stream</strong>
              <p>{player.state.error}</p>
              {desktop ? <Button onClick={desktopPlayer.retry}>{conversionEnabled ? 'Retry with full conversion' : 'Retry'}</Button> : <><p>Web playback depends on the source and browser. Try the desktop app or an external player.</p><DesktopDownload /></>}
              {streamUrl && <><Button onClick={() => { void navigator.clipboard.writeText(streamUrl).catch(() => {}) }}>Copy stream link</Button><Button onClick={() => { void openExternalPlayback(streamUrl, normalizePlaybackPreferences(externalPreferences.data)).catch(() => {}) }}>Open external player</Button></>}
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
            state={effectiveState}
            warning={effectiveState.warning}
            episodeContext={activeTarget.episodeContext ?? null}
            hasEpisodeSwapper={Boolean(activeTarget.seriesEpisodes?.length)}
            forceVisible={tvMode || controlsVisible || !player.state.playing || episodeSheetOpen}
            onOpenEpisodeSwapper={() => { setUpNext(null); setEpisodeSheetOpen(true) }}
            subtitleTracks={streamSubtitleList}
            selectedSubtitleId={playbackState.selectedSubtitleId}
            onSelectSubtitle={(id) => {
              manualSubtitleRef.current = true
              saveSubtitleChoice(activeTarget, { id, language: streamSubtitleList.find(track => track.id === id)?.language ?? null })
              updatePlaybackState({ selectedSubtitleId: id, subtitlesEnabled: id !== null })
              if (castConnected) {
                void castTransport.sendMessage({
                  type: "setProp",
                  propName: "selectedSubtitlesTrackId",
                  propValue: id,
                })
              }
            }}
            subtitleDelay={playbackState.subtitleDelay}
            onSubtitleDelayChange={(value) => updatePlaybackState({ subtitleDelay: value })}
            subtitleSize={playbackState.subtitleSize}
            onSubtitleSizeChange={(value) => updatePlaybackState({ subtitleSize: value })}
            subtitlePosition={playbackState.subtitlePosition}
            onSubtitlePositionChange={(value) => updatePlaybackState({ subtitlePosition: value })}
            subtitleTextColor={playbackState.subtitleTextColor}
            onSubtitleTextColorChange={(value) => updatePlaybackState({ subtitleTextColor: value })}
            subtitleBackgroundColor={playbackState.subtitleBackgroundColor}
            onSubtitleBackgroundColorChange={(value) => updatePlaybackState({ subtitleBackgroundColor: value })}
            subtitleBackgroundOpacity={playbackState.subtitleBackgroundOpacity}
            onSubtitleBackgroundOpacityChange={(value) => updatePlaybackState({ subtitleBackgroundOpacity: value })}
            subtitleOutlineColor={playbackState.subtitleOutlineColor}
            onSubtitleOutlineColorChange={(value) => updatePlaybackState({ subtitleOutlineColor: value })}
            subtitleOutlineStyle={playbackState.subtitleOutlineStyle}
            onSubtitleOutlineStyleChange={(value) => updatePlaybackState({ subtitleOutlineStyle: value })}
            subtitleFontFamily={playbackState.subtitleFontFamily}
            onSubtitleFontFamilyChange={(value) => updatePlaybackState({ subtitleFontFamily: value })}
            subtitleOffsetX={playbackState.subtitleOffsetX}
            onSubtitleOffsetXChange={(value) => updatePlaybackState({ subtitleOffsetX: value })}
            subtitleOffsetY={playbackState.subtitleOffsetY}
            onSubtitleOffsetYChange={(value) => updatePlaybackState({ subtitleOffsetY: value })}
            playbackSpeed={playbackState.playbackSpeed}
            onPlaybackSpeedChange={onChangeSpeed}
            castReady={!desktop && castReady}
            castConnected={castConnected}
            castUnavailableReason={desktop ? 'Use the web app to cast a directly supported stream. Local conversion is available on this computer only.' : castUnavailableReason}
            onCastToggle={() => {
              if (castConnected) {
                castTransport.endCurrentSession(true)
              } else {
                castStartPosition.current = player.state.currentTime
                void castTransport.requestSession().catch((error: unknown) => setCastUnavailableReason(error instanceof Error ? error.message : "Unable to connect to the TV"))
              }
            }}
            onBack={() => {
              saveProgress(effectiveState.currentTime, effectiveState.duration)
              onBack()
            }}
            onTogglePlay={onTogglePlay}
            onSeek={onSeek}
            onVolumeChange={onVolume}
            onToggleMute={onToggleMute}
            onSelectAudioTrack={(id) => {
              updatePlaybackState({ selectedAudioTrackId: id })
              if (castConnected) {
                void castTransport.sendMessage({ type: "setProp", propName: "selectedAudioTrackId", propValue: id })
              } else {
                player.setAudioTrack(id)
              }
            }}
          />

          {subtitleText ? (
            <div
              className="player-captions pointer-events-none absolute inset-x-6 z-[4] text-center"
              style={{
                bottom: `calc(${"var(--player-caption-bottom, max(6vh, 28px))"} + ${playbackState.subtitlePosition * 100 + playbackState.subtitleOffsetY}px + env(safe-area-inset-bottom))`,
                transform: `translateX(${playbackState.subtitleOffsetX}px)`,
                fontSize: `calc(clamp(20px, 2.65vw, 36px) * ${playbackState.subtitleSize})`,
                color: playbackState.subtitleTextColor,
                fontFamily: playbackState.subtitleFontFamily,
                textShadow:
                  playbackState.subtitleOutlineStyle === "shadow"
                    ? `0 0 8px ${playbackState.subtitleOutlineColor}`
                    : `1.5px 0 0 ${playbackState.subtitleOutlineColor}, -1.5px 0 0 ${playbackState.subtitleOutlineColor}, 0 1.5px 0 ${playbackState.subtitleOutlineColor}, 0 -1.5px 0 ${playbackState.subtitleOutlineColor}, 1px 1px 0 ${playbackState.subtitleOutlineColor}, -1px -1px 0 ${playbackState.subtitleOutlineColor}, -1px 1px 0 ${playbackState.subtitleOutlineColor}, 1px -1px 0 ${playbackState.subtitleOutlineColor}`,
              }}
            >
              <span
                style={{
                  backgroundColor: hexToRgba(playbackState.subtitleBackgroundColor, playbackState.subtitleBackgroundOpacity),
                  padding: "0.2em 0.45em",
                  borderRadius: 4,
                  whiteSpace: "pre-line",
                  boxDecorationBreak: "clone",
                }}
              >
                {subtitleText}
              </span>
            </div>
          ) : null}

          {process.env.NODE_ENV === 'development' && subtitleDebugError ? (
            <div className="pointer-events-none absolute right-4 bottom-4 z-[6] rounded bg-black/70 px-2 py-1 text-[11px] text-white/80">
              {subtitleDebugError}
            </div>
          ) : null}

          {upNext && autoSettings.autoplayNext && externalPreferences.data?.stream_action === 'internal' ? <NextEpisodePrompt key={upNext.id} episode={upNext} seconds={autoSettings.countdownSeconds} paused={autoSettings.nextEpisodeLeadSeconds > 0 && player.state.currentTime < player.state.duration - 2 && (!player.state.playing || player.state.status !== 'ready')} onCancel={() => setUpNext(null)} onContinue={() => { setPendingEpisode(upNext); setUpNext(null); setEpisodeSheetOpen(true) }} /> : null}
          <Dialog open={episodeSheetOpen} onOpenChange={open => { setEpisodeSheetOpen(open); if (!open) setPendingEpisode(null) }}>
            <DialogContent
              showCloseButton
              className="dark player-sheet top-0 right-0 left-auto h-dvh max-h-none w-[min(430px,100vw)] translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none p-0 data-open:slide-in-from-right-full data-closed:slide-out-to-right-full data-open:zoom-in-100 data-closed:zoom-out-100"
            >
              <DialogTitle className="pr-12">Episodes</DialogTitle>
              <EpisodeSwapper
                episodes={releaseCatalog.data?.items ?? activeTarget.seriesEpisodes ?? []}
                selectedEpisodeId={activeTarget.videoId}
                selectedSeason={selectedSwapSeason}
                onSeasonChange={season => { setSelectedSwapSeason(season); saveLastSeason(useAppStore.getState().activeProfileId, activeTarget.mediaId, season) }}
                onSelectEpisode={episode => { setUpNext(null); setPendingEpisode(episode) }}
              />
              {pendingEpisode && !episodeStreams.isFetching ? <div className="grid gap-3"><p className="text-sm">Choose a stream for {pendingEpisode.title}</p>{episodeStreams.error ? <><p role="alert" className="text-sm text-destructive">Could not load streams.</p><Button onClick={() => void episodeStreams.refetch()}>Retry</Button></> : <StreamList autoPickAllowed={false} streams={episodeStreams.data ?? []} isLoading={false} onPlay={changeEpisode} />}</div> : null}
              {pendingEpisode && episodeStreams.isFetching ? (
                <p className="text-sm text-muted-foreground">Loading streams for {pendingEpisode.title}…</p>
              ) : null}
            </DialogContent>
          </Dialog>

          <span className="absolute size-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]" aria-live="polite">

            {effectiveState.status === 'ready' ? `Playing ${media.name}, ${formatDuration(effectiveState.duration)}` : null}
            {effectiveState.error ? `Playback error: ${effectiveState.error}` : null}
          </span>
        </div>
      </div>
    </TooltipProvider>
  )
}

export function PlayerChrome({
  playerRef,
  mediaName,
  state,
  warning,
  episodeContext,
  hasEpisodeSwapper,
  forceVisible,
  onOpenEpisodeSwapper,
  subtitleTracks,
  selectedSubtitleId,
  onSelectSubtitle,
  subtitleDelay,
  onSubtitleDelayChange,
  subtitleSize,
  onSubtitleSizeChange,
  subtitlePosition,
  onSubtitlePositionChange,
  subtitleTextColor,
  onSubtitleTextColorChange,
  subtitleBackgroundColor,
  onSubtitleBackgroundColorChange,
  subtitleBackgroundOpacity,
  onSubtitleBackgroundOpacityChange,
  subtitleOutlineColor,
  onSubtitleOutlineColorChange,
  subtitleOutlineStyle,
  onSubtitleOutlineStyleChange,
  subtitleFontFamily,
  onSubtitleFontFamilyChange,
  subtitleOffsetX,
  onSubtitleOffsetXChange,
  subtitleOffsetY,
  onSubtitleOffsetYChange,
  playbackSpeed,
  onPlaybackSpeedChange,
  castReady,
  castConnected,
  castUnavailableReason,
  onCastToggle,
  onBack,
  onTogglePlay,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onSelectAudioTrack,
}: {
  playerRef: RefObject<HTMLDivElement | null>
  mediaName: string
  state: PlayerState
  warning: string | null
  episodeContext: PlaybackTarget["episodeContext"]
  hasEpisodeSwapper: boolean
  forceVisible: boolean
  onOpenEpisodeSwapper: () => void
  subtitleTracks: Array<{ id: string; language: string; source: string }>
  selectedSubtitleId: string | null
  onSelectSubtitle: (id: string | null) => void
  subtitleDelay: number
  onSubtitleDelayChange: (value: number) => void
  subtitleSize: number
  onSubtitleSizeChange: (value: number) => void
  subtitlePosition: number
  onSubtitlePositionChange: (value: number) => void
  subtitleTextColor: string
  onSubtitleTextColorChange: (value: string) => void
  subtitleBackgroundColor: string
  onSubtitleBackgroundColorChange: (value: string) => void
  subtitleBackgroundOpacity: number
  onSubtitleBackgroundOpacityChange: (value: number) => void
  subtitleOutlineColor: string
  onSubtitleOutlineColorChange: (value: string) => void
  subtitleOutlineStyle: string
  onSubtitleOutlineStyleChange: (value: string) => void
  subtitleFontFamily: string
  onSubtitleFontFamilyChange: (value: string) => void
  subtitleOffsetX: number
  onSubtitleOffsetXChange: (value: number) => void
  subtitleOffsetY: number
  onSubtitleOffsetYChange: (value: number) => void
  playbackSpeed: number
  onPlaybackSpeedChange: (value: number) => void
  castReady: boolean
  castConnected: boolean
  castUnavailableReason: string | null
  onCastToggle: () => void
  onBack: () => void
  onTogglePlay: () => void
  onSeek: (seconds: number) => void
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
  onSelectAudioTrack: (id: string | null) => void
}) {
  const disabled = !canControlPlayback(state)
  const actualVolume = state.muted ? 0 : state.volume
  const VolumeIcon = state.muted || state.volume === 0 ? VolumeX : state.volume < 0.5 ? Volume1 : Volume2
  const [audioMenuOpen, setAudioMenuOpen] = useState(false)
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const [subtitleMenuOpen, setSubtitleMenuOpen] = useState(false)
  const [subtitleSettingsOpen, setSubtitleSettingsOpen] = useState(false)
  const controlsLayerRef = useRef<HTMLDivElement | null>(null)
  const selectedAudioTrack =
    state.audioTracks.find((track) => track.id === state.selectedAudioTrackId) ?? null
  const audioLabel = selectedAudioTrack ? languageName(selectedAudioTrack.language) : 'Audio'
  const speedLabel = `${formatSpeedLabel(playbackSpeed)}x`
  const controlsPinnedOpen = state.status === 'loading' || state.status === 'idle' || forceVisible || audioMenuOpen || speedMenuOpen || subtitleMenuOpen || subtitleSettingsOpen

  useEffect(() => {
    if (!audioMenuOpen && !speedMenuOpen && !subtitleMenuOpen) {
      return
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (controlsLayerRef.current?.contains(target ?? null)) {
        return
      }
      setAudioMenuOpen(false)
      setSpeedMenuOpen(false)
      setSubtitleMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      setAudioMenuOpen(false)
      setSpeedMenuOpen(false)
      setSubtitleMenuOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [audioMenuOpen, speedMenuOpen, subtitleMenuOpen])

  return (
    <div
      ref={controlsLayerRef}
      data-visible={controlsPinnedOpen}
      className={cn(
        "player-chrome pointer-events-none absolute inset-x-0 top-0 bottom-0 z-[5] flex translate-y-1 flex-col justify-between opacity-0 transition-[opacity,transform] duration-200",
        controlsPinnedOpen ? "translate-y-0 opacity-100" : "[&_*]:!pointer-events-none",
      )}
    >
      <div className="player-top-controls pointer-events-auto flex items-start justify-between gap-3 p-4 sm:p-6">
        <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon-lg"
              className="size-11 rounded-full border-0 bg-black/55 text-white hover:bg-white/15 hover:text-white dark:hover:bg-white/15 focus-visible:bg-white/15 focus-visible:text-white focus-visible:ring-white/30 [&_svg]:size-[22px]"
              type="button"
              onClick={onBack}
              aria-label="Back"
            >
              <ArrowLeft aria-hidden="true" />
            </Button>
          <button type="button" className="player-episode flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/10" onClick={hasEpisodeSwapper ? onOpenEpisodeSwapper : undefined} disabled={!hasEpisodeSwapper} aria-label={hasEpisodeSwapper ? 'Choose episode' : undefined}>
            <div className="grid gap-0.5"><span className="max-w-[55vw] truncate text-sm font-medium">{mediaName}</span>{episodeContext ? <span className="max-w-[55vw] truncate text-xs text-white/65">{formatEpisodeBadge(episodeContext.season, episodeContext.episode)} · {episodeContext.title}</span> : null}</div>
          </button>
        </div>

        {warning ? (
          <p className="max-w-[min(520px,60vw)] rounded-md bg-black/62 px-3 py-2 text-right text-xs font-medium text-white/78">
            {warning}
          </p>
        ) : null}
      </div>

      <div className="player-bottom-controls pointer-events-auto grid gap-1 px-4 pb-4 sm:px-6 sm:pb-6">
        <ProgressScrubber
          label={`Seek ${mediaName}`}
          value={state.currentTime}
          max={state.duration}
          disabled={disabled}
          onChange={onSeek}
        />

        <div className="player-toolbar grid gap-1 px-1 py-1">
          <div className="flex min-h-11 items-center gap-2 max-[620px]:grid max-[620px]:grid-cols-[auto_1fr_auto]">
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

          <span className="min-w-[104px] whitespace-nowrap text-sm font-medium tabular-nums text-white/86 max-[620px]:min-w-0">
            {formatTimestamp(state.currentTime)} / {formatTimestamp(state.duration)}
          </span>

          <div className="flex items-center gap-2 max-[620px]:col-start-3 max-[620px]:row-start-1">
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

            <div className="ml-auto flex items-center gap-1 max-[620px]:col-span-3 max-[620px]:col-start-1 max-[620px]:row-start-2 max-[620px]:w-full max-[620px]:justify-between">
              <div className="relative">
                <TooltipButton label="Playback speed">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full text-white hover:bg-white/14 focus-visible:ring-white/30"
                    type="button"
                    onClick={() => {
                      setSpeedMenuOpen((value) => !value)
                      setAudioMenuOpen(false)
                      setSubtitleMenuOpen(false)
                    }}
                    aria-label="Playback speed"
                  >
                    <Timer aria-hidden="true" className="size-3.5" />
                    <span className="text-[11px]">{speedLabel}</span>
                  </Button>
                </TooltipButton>
                {speedMenuOpen ? (
                  <div className="player-menu absolute left-0 bottom-full z-20 mb-2 grid min-w-[120px] gap-1 rounded-md border border-white/18 bg-black/88 p-1 text-xs shadow-lg backdrop-blur">
                    {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
                      <button
                        key={String(speed)}
                        type="button"
                        className={cn(
                          "rounded px-2 py-1 text-left text-white/90 hover:bg-white/14",
                          playbackSpeed === speed && "bg-white/20",
                        )}
                        onClick={() => {
                          onPlaybackSpeedChange(speed)
                          setSpeedMenuOpen(false)
                        }}
                      >
                        {formatSpeedLabel(speed)}x
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="relative">
                <TooltipButton label="Audio track">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-full text-white hover:bg-white/14 focus-visible:ring-white/30"
                    type="button"
                    onClick={() => {
                      setAudioMenuOpen((value) => !value)
                      setSpeedMenuOpen(false)
                      setSubtitleMenuOpen(false)
                    }}
                    aria-label="Audio track"
                  >
                    <Languages aria-hidden="true" className="size-3.5" />
                    <span className="max-w-[90px] truncate text-[11px]">{audioLabel}</span>
                  </Button>
                </TooltipButton>
                {audioMenuOpen ? (
                  <div className="player-menu absolute left-0 bottom-full z-20 mb-2 grid min-w-[220px] gap-1 rounded-md border border-white/18 bg-black/88 p-1 text-xs shadow-lg backdrop-blur">
                    <button
                      type="button"
                      className={cn(
                        "rounded px-2 py-1 text-left text-white/90 hover:bg-white/14",
                        !state.selectedAudioTrackId && "bg-white/20",
                      )}
                      onClick={() => {
                        onSelectAudioTrack(null)
                        setAudioMenuOpen(false)
                      }}
                    >
                      Default audio
                    </button>
                    {state.audioTracks.map((track) => (
                      <button
                        key={track.id}
                        type="button"
                        className={cn(
                          "rounded px-2 py-1 text-left text-white/90 hover:bg-white/14",
                          state.selectedAudioTrackId === track.id && "bg-white/20",
                        )}
                        onClick={() => {
                          onSelectAudioTrack(track.id)
                          setAudioMenuOpen(false)
                        }}
                      >
                        {track.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <TooltipButton label={castUnavailableReason ?? (castConnected ? "Stop casting" : "Cast")}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "rounded-full text-white hover:bg-white/14 focus-visible:ring-white/30",
                    !castReady && "opacity-50",
                  )}
                  type="button"
                  onClick={onCastToggle}
                  disabled={!castReady}
                  aria-label={castConnected ? "Stop casting" : "Cast"}
                >
                  <Cast aria-hidden="true" />
                </Button>
              </TooltipButton>
              <div className="relative">
                <TooltipButton label="Subtitles">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-full text-white hover:bg-white/14 focus-visible:ring-white/30"
                    type="button"
                    onClick={() => {
                      setSubtitleMenuOpen((value) => !value)
                      setSpeedMenuOpen(false)
                      setAudioMenuOpen(false)
                    }}
                    aria-label="Subtitles"
                  >
                    <Captions aria-hidden="true" />
                  </Button>
                </TooltipButton>
                {subtitleMenuOpen ? (
                  <div className="player-menu absolute right-0 bottom-full z-20 mb-2 grid min-w-[250px] gap-2 rounded-md border border-white/18 bg-black/88 p-2 text-xs shadow-lg backdrop-blur">
                    <div className="px-2 py-1 text-xs font-medium text-white/50">Subtitles</div>
                    <div role="group" aria-label="Subtitle tracks" className="grid max-h-[min(300px,40dvh)] gap-0.5 overflow-y-auto">
                      <button type="button" aria-pressed={!selectedSubtitleId} className="player-track-option" onClick={() => onSelectSubtitle(null)}>No subtitles{!selectedSubtitleId ? ' ✓' : ''}</button>
                      {[...subtitleTracks].sort((a, b) => (languageName(a.language) === 'English' ? -1 : languageName(b.language) === 'English' ? 1 : languageName(a.language).localeCompare(languageName(b.language)))).map((track, index, tracks) => (
                        <button type="button" key={track.id} aria-pressed={selectedSubtitleId === track.id} className="player-track-option" onClick={() => onSelectSubtitle(track.id)}>
                          <span>{languageName(track.language)}{selectedSubtitleId === track.id ? ' ✓' : ''}</span>
                          <span className="text-[11px] text-white/45">{track.source}{tracks.filter(t => t.language === track.language).length > 1 ? ` · ${tracks.slice(0, index + 1).filter(t => t.language === track.language).length}` : ''}</span>
                        </button>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 justify-start text-white hover:bg-white/12"
                      onClick={() => { setSubtitleMenuOpen(false); setSubtitleSettingsOpen(true) }}
                    >
                      <Settings2 className="size-3.5" />
                      Subtitle settings
                    </Button>
                  </div>
                ) : null}
              </div>
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
      <Dialog open={subtitleSettingsOpen} onOpenChange={setSubtitleSettingsOpen}>
        <DialogContent
          showCloseButton
          className="dark player-sheet top-0 right-0 left-auto h-dvh max-h-none w-[min(430px,100vw)] translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none p-5 data-open:slide-in-from-right-full data-closed:slide-out-to-right-full data-open:zoom-in-100 data-closed:zoom-out-100"
        >
          <DialogTitle className="flex items-center gap-2">
            <Captions className="size-4" />
            Subtitle settings
          </DialogTitle>
          <div className="grid gap-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <LabeledNumberInput label="Delay" value={subtitleDelay} step={0.1} min={-30} max={30} onChange={onSubtitleDelayChange} />
              <LabeledNumberInput label="Size" value={subtitleSize} step={0.05} min={0.5} max={3} onChange={onSubtitleSizeChange} />
              <LabeledNumberInput label="Position" value={subtitlePosition} step={0.05} min={-1} max={1} onChange={onSubtitlePositionChange} />
              <LabeledNumberInput label="Bg Opacity" value={subtitleBackgroundOpacity} step={0.05} min={0} max={1} onChange={onSubtitleBackgroundOpacityChange} />
              <LabeledNumberInput label="Offset X" value={subtitleOffsetX} step={1} min={-100} max={100} onChange={onSubtitleOffsetXChange} />
              <LabeledNumberInput label="Offset Y" value={subtitleOffsetY} step={1} min={-100} max={100} onChange={onSubtitleOffsetYChange} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={subtitleTextColor} onChange={(event) => onSubtitleTextColorChange(event.target.value)} className="h-8 rounded border border-border bg-background px-2 text-foreground" aria-label="Subtitle text color" />
              <input value={subtitleBackgroundColor} onChange={(event) => onSubtitleBackgroundColorChange(event.target.value)} className="h-8 rounded border border-border bg-background px-2 text-foreground" aria-label="Subtitle background color" />
              <input value={subtitleOutlineColor} onChange={(event) => onSubtitleOutlineColorChange(event.target.value)} className="h-8 rounded border border-border bg-background px-2 text-foreground" aria-label="Subtitle outline color" />
              <Select value={subtitleOutlineStyle} onValueChange={onSubtitleOutlineStyleChange}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark">
                  <SelectItem value="outline">Outline</SelectItem>
                  <SelectItem value="shadow">Shadow</SelectItem>
                </SelectContent>
              </Select>
              <Select value={subtitleFontFamily} onValueChange={onSubtitleFontFamilyChange}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark">
                  <SelectItem value="sans-serif">Sans</SelectItem>
                  <SelectItem value="serif">Serif</SelectItem>
                  <SelectItem value="monospace">Monospace</SelectItem>
                  <SelectItem value="system-ui">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TooltipButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="dark">{label}</TooltipContent>
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
        compact ? 'w-[120px] max-[620px]:hidden' : 'w-full',
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
        } else if (event.key === 'Home') {
          onChange(0)
        } else if (event.key === 'End') {
          onChange(max)
        } else {
          return
        }
        event.preventDefault()
        event.stopPropagation()
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

function LabeledNumberInput({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="grid gap-1 text-[11px] text-white/75">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? String(value) : "0"}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-8 rounded border border-white/20 bg-black/40 px-2 text-white"
      />
    </label>
  )
}

function EpisodeSwapper({
  episodes,
  selectedSeason,
  selectedEpisodeId,
  onSeasonChange,
  onSelectEpisode,
}: {
  episodes: Episode[]
  selectedSeason: number | null
  selectedEpisodeId: string | null
  onSeasonChange: (season: number | null) => void
  onSelectEpisode: (episode: Episode) => void
}) {
  const seasons = useMemo(
    () => Array.from(new Set(episodes.map((episode) => episode.season))),
    [episodes],
  )
  const activeSeason = selectedSeason ?? seasons[0] ?? null
  const activeSeasonIndex = seasons.findIndex((season) => season === activeSeason)
  const hasPreviousSeason = activeSeasonIndex > 0
  const hasNextSeason = activeSeasonIndex >= 0 && activeSeasonIndex < seasons.length - 1
  const visible = useMemo(
    () => episodes.filter((episode) => episode.season === activeSeason),
    [activeSeason, episodes],
  )

  return (
    <div className="grid min-h-0 gap-4">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Previous season"
          disabled={!hasPreviousSeason}
          onClick={() => {
            if (!hasPreviousSeason) {
              return
            }
            onSeasonChange(seasons[activeSeasonIndex - 1] ?? null)
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Select
          value={activeSeason === null ? "__none" : String(activeSeason)}
          onValueChange={(value) => onSeasonChange(value === "__none" ? null : Number(value))}
        >
          <SelectTrigger className="w-full" aria-label="Season">
            <SelectValue placeholder="Season" />
          </SelectTrigger>
          <SelectContent className="dark">
            {seasons.map((season) => (
              <SelectItem key={String(season)} value={season === null ? "__none" : String(season)}>
                {season === null ? "Extras" : season === 0 ? "Special" : `Season ${season}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Next season"
          disabled={!hasNextSeason}
          onClick={() => {
            if (!hasNextSeason) {
              return
            }
            onSeasonChange(seasons[activeSeasonIndex + 1] ?? null)
          }}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <div className="grid max-h-[calc(100dvh-170px)] gap-2 overflow-y-auto pr-1 [scrollbar-width:thin]">
        {visible.map((episode) => (
          <EpisodeSwapperItem
            key={episode.id}
            episode={episode}
            active={selectedEpisodeId === episode.id}
            onSelectEpisode={onSelectEpisode}
          />
        ))}
      </div>
    </div>
  )
}

function EpisodeSwapperItem({
  episode,
  active,
  onSelectEpisode,
}: {
  episode: Episode
  active: boolean
  onSelectEpisode: (episode: Episode) => void
}) {

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card/70",
        active && "border-primary/45 bg-card",
      )}
    >
      <button
        className="grid w-full min-w-0 cursor-pointer grid-cols-[96px_1fr] gap-3 text-left"
        type="button"
        onClick={() => onSelectEpisode(episode)}
      >
        <Artwork src={episode.thumbnail} className="h-16 w-24 rounded-l-lg" />
        <div className="min-w-0 px-4 py-2.5">
          <strong className="block overflow-hidden text-ellipsis whitespace-nowrap">
            {episode.title}
          </strong>
          <span className="block text-[0.8rem] text-muted-foreground">
            {formatEpisodeBadge(episode.season, episode.episode)}{formatEpisodeReleaseDate(episode.released) ? ` · ${formatEpisodeReleaseDate(episode.released)}` : ""}
          </span>
        </div>
      </button>
    </div>
  )
}

function formatEpisodeBadge(season: number | null, episode: number | null) {
  const seasonLabel = season === null ? "EX" : `S${String(Math.max(season, 0)).padStart(2, "0")}`
  const episodeLabel = episode === null ? "E--" : `E${String(Math.max(episode, 0)).padStart(2, "0")}`
  return `${seasonLabel}${episodeLabel}`
}

function hexToRgba(hex: string, opacity: number) {
  const safe = hex.replace("#", "")
  const full = safe.length === 3
    ? safe.split("").map((char) => `${char}${char}`).join("")
    : safe
  const red = Number.parseInt(full.slice(0, 2), 16)
  const green = Number.parseInt(full.slice(2, 4), 16)
  const blue = Number.parseInt(full.slice(4, 6), 16)
  const alpha = Math.max(0, Math.min(opacity, 1))
  return `rgba(${Number.isFinite(red) ? red : 0}, ${Number.isFinite(green) ? green : 0}, ${Number.isFinite(blue) ? blue : 0}, ${alpha})`
}

function useMediabunnyPlayer({
  canvasRef,
  url,
  authToken,
  savedPosition,
  watched,
  preferredAudioLanguage,
  selectedAudioTrackId,
  initialPlaybackSpeed,
  onProgressCommit,
  onEnded,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  url?: string
  authToken: string | null
  savedPosition: number
  watched: boolean
  preferredAudioLanguage: string | null
  selectedAudioTrackId: string | null
  initialPlaybackSpeed: number
  onEnded?: () => void
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
  const endedCallback = useRef(onEnded)
  useEffect(() => { endedCallback.current = onEnded }, [onEnded])
  const onProgressCommitRef = useRef(onProgressCommit)
  const playbackRateRef = useRef(Math.max(0.25, Math.min(initialPlaybackSpeed || 1, 3)))

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
      const elapsed = audioContext.currentTime - audioContextStartTime
      return elapsed * playbackRateRef.current + playbackTimeAtStartRef.current
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

    const generation = ++asyncIdRef.current
    nextFrameRef.current = null
    await videoFrameIteratorRef.current?.return()
    if (generation !== asyncIdRef.current) return
    const iterator = videoSink.canvases(getPlaybackTime())
    videoFrameIteratorRef.current = iterator
    const firstFrame = (await iterator.next()).value ?? null
    const secondFrame = (await iterator.next()).value ?? null
    if (generation !== asyncIdRef.current) { await iterator.return(); return }
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
      node.playbackRate.value = playbackRateRef.current
      node.connect(gainNode)
      const startTimestamp = audioContextStartTimeRef.current!
        + (timestamp - playbackTimeAtStartRef.current) / playbackRateRef.current

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
        endedCallback.current?.()
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

        const [duration, videoTrackResult, audioTracksResult] = await Promise.all([
          input.computeDuration(),
          input.getPrimaryVideoTrack(),
          input.getAudioTracks(),
        ])
        let videoTrack = videoTrackResult
        const audioTracks = audioTracksResult.filter((track): track is InputAudioTrack => Boolean(track))
        let audioTrack: InputAudioTrack | null =
          audioTracks.find((track) => String(track.id) === selectedAudioTrackId)
          ?? audioTracks.find((track) =>
            preferredAudioLanguage
              ? track.languageCode.toLowerCase() === preferredAudioLanguage.toLowerCase()
              : false,
          )
          ?? audioTracks[0]
          ?? null
        let warning = ''

        if (videoTrack) {
          const codec = await resolveTrackCodec(videoTrack)
          if (videoTrack.codec === null) {
            warning += `Unsupported video codec (${codec}). `
            videoTrack = null
          } else if (!(await videoTrack.canDecode())) {
            warning += `Unable to decode the video track codec (${codec}). `
            videoTrack = null
          }
        }

        if (audioTrack) {
          const codec = await resolveTrackCodec(audioTrack)
          if (audioTrack.codec === null) {
            warning += `Unsupported audio codec (${codec}). `
            audioTrack = null
          } else if (!(await audioTrack.canDecode())) {
            warning += `Unable to decode the audio track codec (${codec}). `
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
          playbackSpeed: playbackRateRef.current,
          selectedAudioTrackId: audioTrack ? String(audioTrack.id) : null,
          audioTracks: audioTracks.map((track) => ({
            id: String(track.id),
            label: `${languageName(track.languageCode)}${track.name ? ` · ${track.name}` : ''}`,
            language: track.languageCode,
          })),
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
  }, [
    authToken,
    canvasRef,
    dispose,
    play,
    preferredAudioLanguage,
    render,
    selectedAudioTrackId,
    startVideoIterator,
    updateState,
    url,
  ])

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

  const setPlaybackSpeed = useCallback((speed: number) => {
    const nextSpeed = Math.max(0.25, Math.min(speed, 3))
    if (playingRef.current) {
      const audioContext = audioContextRef.current
      if (audioContext) {
        playbackTimeAtStartRef.current = getPlaybackTime()
        audioContextStartTimeRef.current = audioContext.currentTime
      }
    }
    playbackRateRef.current = nextSpeed
    queuedAudioNodesRef.current.forEach((node) => {
      node.playbackRate.value = nextSpeed
    })
    updateState({ playbackSpeed: nextSpeed })
  }, [getPlaybackTime, updateState])

  const setAudioTrack = useCallback((id: string | null) => {
    updateState({ selectedAudioTrackId: id })
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
    setAudioTrack,
    setPlaybackSpeed,
    toggleMute,
    toggle,
  }), [pause, play, seek, setAudioTrack, setPlaybackSpeed, setVolume, state, toggle, toggleMute])
}

function setGain(gainNode: GainNode | null, volume: number, muted: boolean) {
  if (!gainNode) {
    return
  }
  const actualVolume = muted ? 0 : volume
  gainNode.gain.value = actualVolume ** 2
}

type DecodableTrack = {
  codec: string | null
  getCodecParameterString: () => Promise<string | null>
}

async function resolveTrackCodec(track: DecodableTrack) {
  if (track.codec) {
    return track.codec
  }
  try {
    const codec = await track.getCodecParameterString()
    return codec || 'unknown'
  } catch {
    return 'unknown'
  }
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

function formatSpeedLabel(speed: number) {
  const rounded = Number.isInteger(speed) ? String(speed) : speed.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
  return rounded
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
