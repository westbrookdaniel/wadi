import { StreamFailures, type StreamFailure } from './stream-failures'

import { Button } from '@/components/ui/button'
import { StreamList } from './stream-list'
import type { PlaybackTarget, PlayableStream } from './types'

export function DetailStreamControls({ streams, isLoading, error, failures, onRetry, onPlay, target }: {
  target?: PlaybackTarget
  streams: PlayableStream[]
  isLoading: boolean
  failures?: StreamFailure[]
  error: Error | null
  onRetry: () => void
  onPlay: (stream: PlayableStream) => void
}) {
  const failure = error ? <div role="alert" className="grid gap-2 text-sm"><p className="text-destructive">Could not load streams. {error.message}</p><Button variant="secondary" onClick={onRetry}>Retry</Button></div> : null

  return <>{failure}<StreamFailures failures={failures} /><StreamList target={target} streams={streams} isLoading={isLoading} onPlay={onPlay} /></>
}
