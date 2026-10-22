import { useEffect, useMemo, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { usePlaybackDefaults } from '@/store/use-playback-defaults'
import { useSourceRanking } from './use-source-ranking'
import { useQuery } from '@tanstack/react-query'
import { playbackPreferencesQuery } from '@/api/queries'
import { useDeviceStore } from '@/store/device-store'
import { rankStreams } from './auto-pick'
import { getStreamUrl } from './stream-playback'
import { StreamList } from './stream-list'
import type { PlaybackTarget, PlayableStream } from './types'

export function DetailStreamControls({ streams, isLoading, error, onRetry, onPlay, target, playRequested = false }: {
  target?: PlaybackTarget
  playRequested?: boolean
  streams: PlayableStream[]
  isLoading: boolean
  error: Error | null
  onRetry: () => void
  onPlay: (stream: PlayableStream) => void
}) {
  const { settings, ready } = usePlaybackDefaults()
  const context = useSourceRanking(target)
  const playback = useQuery(playbackPreferencesQuery)
  const tvMode = useDeviceStore(state => state.tvMode)
  const attempted = useRef(false)
  const ranked = useMemo(() => rankStreams(streams, settings, context), [streams, settings, context])
  const selected = ranked.find(row => row.eligible)?.stream
  useEffect(() => {
    if (attempted.current || !ready || isLoading || error || !selected || !getStreamUrl(selected)
      || !playRequested
      || (!tvMode && playback.data?.stream_action !== 'internal')) return
    attempted.current = true
    onPlay(selected)
  }, [ready, isLoading, error, selected, playRequested, tvMode, playback.data, onPlay])
  const failure = error ? <div role="alert" className="grid gap-2 text-sm"><p className="text-destructive">Could not load streams. {error.message}</p><Button variant="secondary" onClick={onRetry}>Retry</Button></div> : null

  return <>{failure}<StreamList target={target} streams={streams} isLoading={isLoading} onPlay={onPlay} /></>
}
