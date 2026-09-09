import { lazy, Suspense } from 'react'
const MediaPlayerPage = lazy(() => import('./player').then(module => ({ default: module.MediaPlayerPage })))
import { useQuery } from '@tanstack/react-query'
import { Check, Clipboard, ExternalLink, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { playbackPreferencesQuery } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { mutedText, stateBlock } from '@/lib/styles'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast-context'

import {
  buildExternalPlayerUrl,
  getStreamUrl,
  normalizePlaybackPreferences,
} from './stream-playback'
import type { PlaybackTarget, PlayableStream } from './types'

function ExternalPlaybackPage({
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
  const { toast } = useToast()
  const preferencesQuery = useQuery(playbackPreferencesQuery)
  const preferences = normalizePlaybackPreferences(preferencesQuery.data)
  const streamUrl = getStreamUrl(stream)
  const externalPlayerUrl = useMemo(
    () =>
      streamUrl
        ? buildExternalPlayerUrl(streamUrl, preferences.external_player_template)
        : null,
    [preferences.external_player_template, streamUrl],
  )
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const hasExternalPlayerAction = Boolean(externalPlayerUrl)
  const primaryAction =
    preferences.stream_action === 'external' && hasExternalPlayerAction
      ? 'external'
      : 'copy'

  const copyStreamLink = async () => {
    if (!streamUrl) {
      return
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable')
      }
      await navigator.clipboard.writeText(streamUrl)
      setCopied(true)
      setCopyError(null)
      toast({ title: 'Stream link copied.' })
    } catch {
      setCopied(false)
      setCopyError('Clipboard access is unavailable. Select the link and copy it manually.')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-background/80 p-4 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Playback options"
      onClick={onBack}
    >
      <div className="grid min-h-full place-items-center">
        <section
          className="relative grid w-full max-w-[860px] gap-6 rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-8"
          onClick={(event) => event.stopPropagation()}
        >
          <Button
            className="absolute top-4 right-4"
            variant="ghost"
            size="icon"
            type="button"
            aria-label="Close playback options"
            onClick={onBack}
          >
            <X aria-hidden="true" />
          </Button>

          <div className="grid gap-2 pr-10">
            <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">
              {media.name}
            </h1>
            {target.episodeContext ? (
              <p className={cn('m-0', mutedText)}>
                {target.episodeContext.title}
              </p>
            ) : null}
            <p className={cn('m-0 max-w-[650px]', mutedText)}>
              Wadi hands the stream to your configured player instead of decoding it in the browser.
            </p>
          </div>

          {streamUrl ? (
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="stream-url">
                Stream link
              </label>
              <Input
                id="stream-url"
                readOnly
                value={streamUrl}
                onFocus={(event) => event.currentTarget.select()}
                aria-describedby={copyError ? 'stream-copy-error' : undefined}
              />
              {copyError ? (
                <p id="stream-copy-error" className="m-0 text-sm text-destructive">
                  {copyError}
                </p>
              ) : null}
            </div>
          ) : (
            <div className={cn(stateBlock, 'min-h-0 rounded-2xl border border-border bg-background/50 px-5 py-6')}>
              <strong>This stream has no direct URL</strong>
              <p>Choose another stream or use the addon-provided external link if one is available.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {primaryAction === 'external' ? (
              <Button size="lg" asChild>
                <a href={externalPlayerUrl ?? '#'}>
                  <ExternalLink aria-hidden="true" />
                  Open in external player
                </a>
              </Button>
            ) : (
              <Button size="lg" type="button" disabled={!streamUrl} onClick={() => void copyStreamLink()}>
                {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
                {copied ? 'Copied stream link' : 'Copy stream link'}
              </Button>
            )}

            {primaryAction === 'external' ? (
              <Button variant="secondary" size="lg" type="button" disabled={!streamUrl} onClick={() => void copyStreamLink()}>
                {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy link instead'}
              </Button>
            ) : hasExternalPlayerAction ? (
              <Button size="lg" variant="secondary" asChild>
                <a href={externalPlayerUrl ?? '#'}>
                  <ExternalLink aria-hidden="true" />
                  Open in external player
                </a>
              </Button>
            ) : null}
          </div>

          {preferencesQuery.isLoading ? (
            <p className={cn('m-0 text-xs', mutedText)}>Loading playback preferences…</p>
          ) : null}
          {!hasExternalPlayerAction && streamUrl ? (
            <p className={cn('m-0 text-xs', mutedText)}>
              Configure an external-player URL template in Settings to enable one-click playback.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  )
}

export function StreamPlaybackPage(props: Parameters<typeof ExternalPlaybackPage>[0]) {
  return props.stream.url && /^https?:\/\//i.test(props.stream.url) ? <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-black text-white" role="status">Opening player…</div>}><MediaPlayerPage key={`${props.target.videoId ?? props.target.mediaId}:${props.stream.url}`} {...props} /></Suspense> : <ExternalPlaybackPage {...props} />
}
