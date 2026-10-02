import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { initialPlayerState, type PlayerState } from './state'
import { languageName } from './subtitle-utils'

export function useMediabunnyPlayer({
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
  const playbackCommandRef = useRef(0)
  const initializationRef = useRef<Promise<void> | null>(null)
  const closingIteratorsRef = useRef(new Set<Promise<unknown>>())
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

  const closeIterator = useCallback((iterator: AsyncGenerator<unknown, void, unknown> | null) => {
    if (!iterator) return
    const pending = iterator.return()
    closingIteratorsRef.current.add(pending)
    void pending.then(
      () => closingIteratorsRef.current.delete(pending),
      error => { closingIteratorsRef.current.delete(pending); console.error(error) },
    )
  }, [])

  const pause = useCallback((commit = true) => {
    playbackCommandRef.current += 1
    playbackTimeAtStartRef.current = Math.min(getPlaybackTime(), durationRef.current)
    playingRef.current = false
    closeIterator(audioBufferIteratorRef.current)
    audioBufferIteratorRef.current = null
    stopQueuedAudio()
    updateState({ playing: false, currentTime: playbackTimeAtStartRef.current })
    if (commit) {
      onProgressCommitRef.current(playbackTimeAtStartRef.current, durationRef.current)
    }
  }, [closeIterator, getPlaybackTime, stopQueuedAudio, updateState])

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
    if (generation !== asyncIdRef.current) return
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
      if (!playingRef.current || iterator !== audioBufferIteratorRef.current) {
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
        await waitUntilNearPlaybackTime(timestamp, getPlaybackTime, () => playingRef.current && iterator === audioBufferIteratorRef.current)
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

    const command = ++playbackCommandRef.current
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
    if (command !== playbackCommandRef.current || audioContext !== audioContextRef.current) return

    if (getPlaybackTime() >= durationRef.current) {
      playbackTimeAtStartRef.current = 0
      await startVideoIterator()
    }

    if (command !== playbackCommandRef.current || audioContext !== audioContextRef.current) return
    audioContextStartTimeRef.current = audioContext.currentTime
    playingRef.current = true
    updateState({ playing: true })

    if (audioSinkRef.current) {
      closeIterator(audioBufferIteratorRef.current)
      audioBufferIteratorRef.current = audioSinkRef.current.buffers(getPlaybackTime())
      void runAudioIterator()
    }
  }, [closeIterator, getPlaybackTime, runAudioIterator, startVideoIterator, updateState])

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
    if (durationRef.current > 0 && nextTime >= durationRef.current) {
      onProgressCommitRef.current(nextTime, durationRef.current)
      endedCallback.current?.()
      return
    }
    const command = ++playbackCommandRef.current
    await startVideoIterator()
    if (command !== playbackCommandRef.current) return

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
    playbackCommandRef.current += 1
    playingRef.current = false
    closeIterator(videoFrameIteratorRef.current)
    closeIterator(audioBufferIteratorRef.current)
    videoFrameIteratorRef.current = null
    audioBufferIteratorRef.current = null
    nextFrameRef.current = null
    stopQueuedAudio()
    const input = inputRef.current
    const audioContext = audioContextRef.current
    const initialization = initializationRef.current
    initializationRef.current = null
    // return() drains pending generator reads. Keep their input alive until
    // they finish; disposing first makes Mediabunny throw InputDisposedError.
    const closing = [...closingIteratorsRef.current]
    void Promise.allSettled([initialization, ...closing]).then(async () => {
      input?.dispose()
      await audioContext?.close()
    }).catch(error => console.error(error))
    inputRef.current = null
    videoSinkRef.current = null
    audioSinkRef.current = null
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
  }, [closeIterator, getPlaybackTime, stopQueuedAudio])

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
        if (canceled) return
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

        if (canceled) return

        const AudioContextConstructor = getAudioContextConstructor()
        const audioContext = audioTrack
          ? new AudioContextConstructor({ sampleRate: audioTrack.sampleRate })
          : new AudioContextConstructor()
        const gainNode = audioContext.createGain()
        gainNode.connect(audioContext.destination)
        audioContextRef.current = audioContext
        gainNodeRef.current = gainNode

        const videoCanBeTransparent = videoTrack ? await videoTrack.canBeTransparent() : false
        if (canceled) return
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
        hasRestoredRef.current = true
        playingRef.current = false
        setGain(gainNode, stateRef.current.volume, stateRef.current.muted)
        await startVideoIterator()
        if (canceled) return
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

    initializationRef.current = init()

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

async function waitUntilNearPlaybackTime(timestamp: number, getPlaybackTime: () => number, isCurrent: () => boolean) {
  while (isCurrent() && timestamp - getPlaybackTime() >= 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 100))
  }
}

function getAudioContextConstructor() {
  const webkitWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext
  }
  return window.AudioContext ?? webkitWindow.webkitAudioContext!
}

