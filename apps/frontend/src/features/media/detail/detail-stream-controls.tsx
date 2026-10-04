import { useId, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useAutoPlayback } from '@/store/auto-playback'
import { rankStreams } from './auto-pick'
import { getStreamUrl } from './stream-playback'
import { StreamList } from './stream-list'
import type { PlayableStream } from './types'

// The parent keys this component by title/episode. A late query response cannot
// carry either a manual choice or a pending playback action into another target.
export function DetailStreamControls({ streams, isLoading, error, onRetry, onPlay }: {
  streams: PlayableStream[]
  isLoading: boolean
  error: Error | null
  onRetry: () => void
  onPlay: (stream: PlayableStream) => void
}) {
  const settings = useAutoPlayback(state => state.settings)
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const lastLaunch = useRef<number>(-Infinity)
  const selectorId = useId()
  const ranked = useMemo(() => rankStreams(streams, settings), [streams, settings])
  const manual = choice ? streams.find(stream => streamKey(stream) === choice) : undefined
  const selected = choice ? manual : settings.enabled
    ? ranked.find(row => row.eligible)?.stream
    : streams.find(stream => getStreamUrl(stream))
  const close = () => { setOpen(false); trigger.current?.focus() }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" onKeyDown={event => {
      if (open && (event.key === 'Escape' || event.key === 'BrowserBack') && !event.defaultPrevented) {
        event.preventDefault(); event.stopPropagation(); if (!event.repeat) close()
      }
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault()
    }}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" data-tv-default data-tv-focus-key="watch" disabled={isLoading || Boolean(error) || !selected || !getStreamUrl(selected)} onClick={() => {
          // Bound double clicks/held remote OK without blocking a deliberate retry.
          if (!selected || Date.now() - lastLaunch.current < 500) return
          lastLaunch.current = Date.now()
          onPlay(selected)
        }}>Watch</Button>
        <Button ref={trigger} type="button" variant="secondary" aria-expanded={open} aria-controls={selectorId} onClick={() => open ? close() : setOpen(true)}>
          {choice ? 'Change stream' : 'See streams'}
        </Button>
      </div>
      {isLoading ? <p role="status" data-tv-loading className="text-sm text-muted-foreground">Loading streams…</p>
        : error ? <div role="alert" className="grid gap-2 text-sm"><p className="text-destructive">Could not load streams. {error.message}</p><Button variant="secondary" onClick={onRetry}>Retry</Button></div>
        : selected ? <p className="text-sm text-muted-foreground">Selected: {selected.title ?? selected.name ?? 'Stream'}{!getStreamUrl(selected) ? ' · Unavailable' : ''}</p>
        : <p role="status" className="text-sm text-muted-foreground">{choice ? 'The selected stream is no longer available. Choose another stream.' : !streams.length ? 'No streams returned.' : settings.enabled ? 'No stream matches your auto-pick rules. Choose a stream.' : 'No playable streams returned.'}</p>}
      {open ? <section data-stream-selector id={selectorId} aria-label="Choose stream" className="flex min-h-0 flex-1 flex-col gap-3">
        <Button type="button" variant="ghost" size="sm" className="w-fit" data-tv-back onClick={close}>Close streams</Button>
        {!error ? <StreamList streams={streams} isLoading={isLoading} autoPickAllowed={false} selectionOnly selectedStream={selected} onPlay={stream => setChoice(streamKey(stream))} /> : null}
      </section> : null}
    </div>
  )
}

function streamKey(stream: PlayableStream) {
  return JSON.stringify([stream.addon_id, stream.url, stream.externalUrl, stream.infoHash, stream.fileIdx])
}
