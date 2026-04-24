import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'

import { streamsQuery } from '@/api/queries'
import type { MediaPreview, StreamInfo } from '@/api/types'
import { useStreamMetadata } from '@/hooks/use-stream-metadata'

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
    <div className="detail-page" aria-label={`${media.name} details`}>
      <button className="icon-text-button detail-back" type="button" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        Back
      </button>

      <div className="detail-layout">
        <section className="detail-hero">
          {media.poster ? <img src={media.poster} alt="" /> : null}
          <div className="detail-copy">
            <h2>{media.name}</h2>
            <p>{[media.type, media.releaseInfo].filter(Boolean).join(' • ')}</p>
            <p>{media.description ?? 'No description available.'}</p>
            {listAction}
          </div>
        </section>

        <aside className="stream-sidebar" aria-label="Available streams">
          <h3>Streams</h3>
          {streams.isLoading ? <p className="muted-text">Loading streams</p> : null}
          {streams.data?.length ? (
            <div className="stream-list">
              {streams.data.map((stream, index) => (
                <button
                  className="stream-card"
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
            <p className="muted-text">No streams returned.</p>
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
    <div className="player-page">
      <div className="player-frame">
        <video className="media-player" src={streamUrl} controls autoPlay playsInline poster={media.poster} />
        <button className="player-back-button" type="button" onClick={onBack} aria-label="Back">
          <ArrowLeft aria-hidden="true" />
        </button>
      </div>

      {!streamUrl ? (
        <div className="state-block">
          <strong>This stream cannot play directly</strong>
          <p>Only direct stream URLs can be played in the browser right now.</p>
          {stream.externalUrl ? (
            <a className="primary-button small" href={stream.externalUrl} target="_blank" rel="noreferrer">
              Open external stream
            </a>
          ) : null}
        </div>
      ) : null}

      <span className="sr-only" aria-live="polite">
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
