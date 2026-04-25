import { bottomPagePadding, mutedText } from '@/lib/styles'

import type { PlayableStream } from './types'
import { cn } from '@/lib/utils'

export function StreamList({
  streams,
  isLoading,
  onPlay,
}: {
  streams: PlayableStream[]
  isLoading: boolean
  onPlay: (stream: PlayableStream) => void
}) {
  if (isLoading) {
    return <p className={mutedText}>Loading streams</p>
  }

  if (!streams.length) {
    return <p className={mutedText}>No streams returned.</p>
  }

  return (
    <div className={cn("flex flex-col gap-2.5 overflow-y-auto pr-1 [scrollbar-width:thin]", bottomPagePadding)}>
      {streams.map((stream, index) => (
        <button
          className="grid h-fit cursor-pointer content-between gap-2.5 rounded-lg border border-border bg-card/80 p-3.5 text-left text-card-foreground hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none [&_small]:text-[0.76rem] [&_small]:text-primary [&_span]:text-muted-foreground"
          type="button"
          key={`${stream.addon_id}-${stream.title ?? stream.name ?? index}`}
          onClick={() => onPlay(stream)}
        >
          <p className="font-bold line">{stream.title ?? stream.name ?? `Stream ${index + 1}`}</p>
          <p className="max-w-full break-all">{streamDetail(stream)}</p>
          <p className="text-xs text-muted-foreground max-w-full break-all">{streamSource(stream)}</p>
        </button>
      ))}
    </div>
  )
}

function streamDetail(stream: PlayableStream) {
  const behaviorHints =
    stream.behaviorHints && typeof stream.behaviorHints === 'object'
      ? (stream.behaviorHints as Record<string, unknown>)
      : {}
  const parts = [
    stringValue(stream.quality),
    stringValue(behaviorHints.filename),
    stringValue(stream.description),
    stream.infoHash ? 'Torrent' : undefined,
  ].filter(Boolean)

  return parts.length ? parts.join(' • ') : stream.url ? 'Direct browser-playable stream' : 'Addon stream'
}

function streamSource(stream: PlayableStream) {
  if (stream.url) {
    return new URL(stream.url).hostname
  }

  if (stream.externalUrl) {
    try {
      return new URL(stream.externalUrl).hostname
    } catch {
      return 'External stream'
    }
  }

  return stream.addon_id ?? 'Unknown source'
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
