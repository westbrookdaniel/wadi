import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { streamsQuery } from '@/api/queries'
import type { MediaPreview, StreamInfo } from '@/api/types'
import { useStreamMetadata } from '@/hooks/use-stream-metadata'
import { iconTextButton, mutedText, primaryButton, smallButton, stateBlock } from '@/lib/styles'
import { cn } from '@/lib/utils'

export type PlayableStream = StreamInfo & { addon_id?: string }

export function MediaDetailPage({
  media,
  listAction,
  onBack,
  onPlay,
}: {
  media: MediaPreview | null
  listAction?: React.ReactNode
  onBack: () => void
  onPlay: (stream: PlayableStream) => void
}) {
  const streams = useQuery(streamsQuery(media?.type ?? '', media?.id ?? '', Boolean(media)))

  if (!media) {
    return null
  }

  return (
    <div className="grid gap-7" aria-label={`${media.name} details`}>
      <button className={cn(iconTextButton, 'mt-6 ml-6 w-fit')} type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        Back
      </button>

      <div className="grid min-h-[calc(100svh-64px)] grid-cols-[minmax(0,1fr)_minmax(280px,360px)] items-stretch gap-0 pl-[clamp(24px,5vw,64px)] max-[800px]:min-h-0 max-[800px]:grid-cols-1 max-[800px]:gap-[22px] max-[800px]:px-[22px] max-[800px]:pb-[22px]">
        <section className="grid min-h-[min(68svh,680px)] grid-cols-[minmax(180px,280px)_minmax(0,680px)] items-end gap-[clamp(22px,5vw,56px)] max-[800px]:min-h-0 max-[800px]:grid-cols-1">
          {media.poster ? <img className="aspect-[2/3] w-full rounded-lg object-cover shadow-[0_28px_80px_hsl(0_0%_0%/42%)] max-[800px]:w-[min(220px,70vw)]" src={media.poster} alt="" /> : null}
          <div className="grid gap-[18px]">
            <h2 className="m-0 text-[clamp(2.3rem,6vw,5.6rem)] leading-[0.95] tracking-normal max-[800px]:text-[clamp(2rem,12vw,3.8rem)]">{media.name}</h2>
            <p className={cn('m-0 max-w-[680px]', mutedText)}>{[media.type, media.releaseInfo].filter(Boolean).join(' • ')}</p>
            <p className={cn('m-0 max-w-[680px]', mutedText)}>{media.description ?? 'No description available.'}</p>
            {listAction}
          </div>
        </section>

        <aside
          className="grid h-[calc(100svh-64px)] content-start gap-3.5 overflow-hidden rounded-lg bg-[hsl(240_14%_4%/72%)] p-4 max-[800px]:h-auto max-[800px]:max-h-[55svh]"
          aria-label="Available streams"
        >
          <h3 className="m-0 tracking-normal">Streams</h3>
          {streams.isLoading ? <p className={mutedText}>Loading streams</p> : null}
          {streams.data?.length ? (
            <div className="grid gap-2.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {streams.data.map((stream, index) => (
                <button
                  className="grid min-h-[116px] cursor-pointer content-between gap-2.5 rounded-lg border border-[hsl(0_0%_100%/9%)] bg-[hsl(255_16%_12%/88%)] p-3.5 text-left text-[hsl(0_0%_94%)] hover:border-[hsl(0_0%_100%/30%)] hover:bg-[hsl(0_0%_100%/9%)] hover:outline-0 focus-visible:border-[hsl(0_0%_100%/30%)] focus-visible:bg-[hsl(0_0%_100%/9%)] focus-visible:outline-0 [&_small]:text-[0.76rem] [&_small]:text-[hsl(322_90%_76%)] [&_span]:text-[hsl(240_6%_64%)]"
                  type="button"
                  key={`${stream.addon_id}-${stream.title ?? index}`}
                  onClick={() => onPlay(stream)}
                >
                  <strong>{stream.title ?? stream.name ?? `Stream ${index + 1}`}</strong>
                  <span>{streamDetail(stream)}</span>
                  <small>{streamSource(stream)}</small>
                </button>
              ))}
            </div>
          ) : !streams.isLoading ? (
            <p className={mutedText}>No streams returned.</p>
          ) : null}
        </aside>
      </div>
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

export function MediaPlayerPage({
  media,
  stream,
  onBack,
}: {
  media: MediaPreview
  stream: PlayableStream
  onBack: () => void
}) {
  const streamUrl = stream.url
  const metadata = useStreamMetadata(streamUrl)

  return (
    <div className="min-h-svh bg-black">
      <div className="group relative min-h-svh bg-black focus-within:[&_.player-back-button]:translate-y-0 focus-within:[&_.player-back-button]:opacity-100 hover:[&_.player-back-button]:translate-y-0 hover:[&_.player-back-button]:opacity-100">
        <video className="block h-svh w-screen bg-black object-contain" src={streamUrl} controls autoPlay playsInline poster={media.poster} />
        <button
          className="player-back-button absolute top-6 left-6 z-[5] grid size-11 -translate-y-1.5 cursor-pointer place-items-center rounded-full border-0 bg-[hsl(0_0%_0%/55%)] text-[hsl(0_0%_98%)] opacity-0 transition-[opacity,transform,background-color] duration-200 hover:bg-[hsl(0_0%_0%/78%)] hover:outline-2 hover:outline-offset-2 hover:outline-[hsl(0_0%_100%/70%)] focus-visible:bg-[hsl(0_0%_0%/78%)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(0_0%_100%/70%)] [&_svg]:size-[22px]"
          type="button"
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft aria-hidden="true" />
        </button>
      </div>

      {!streamUrl ? (
        <div className={stateBlock}>
          <strong>This stream cannot play directly</strong>
          <p>Only direct stream URLs can be played in the browser right now.</p>
          {stream.externalUrl ? (
            <a className={cn(primaryButton, smallButton)} href={stream.externalUrl} target="_blank" rel="noreferrer">
              Open external stream
            </a>
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

function formatDuration(duration: number) {
  if (!Number.isFinite(duration)) {
    return 'Unknown duration'
  }

  const minutes = Math.round(duration / 60)
  return `${minutes} min`
}
