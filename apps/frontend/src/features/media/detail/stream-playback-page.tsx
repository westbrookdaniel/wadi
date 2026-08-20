import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Check, Clipboard, ExternalLink } from 'lucide-react'
import { useMemo, useState } from 'react'

import { playbackPreferencesQuery } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { mutedText, pagePadding, stateBlock } from '@/lib/styles'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'

import {
  buildExternalPlayerUrl,
  getStreamUrl,
  normalizePlaybackPreferences,
} from './stream-playback'
import type { PlaybackTarget, PlayableStream } from './types'

export function StreamPlaybackPage({
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
    <div className="min-h-svh bg-background">
      <main className={cn('mx-auto grid min-h-svh w-full max-w-[860px] content-center gap-6', pagePadding)}>
        <Button className="w-fit" variant="ghost" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Back to details
        </Button>

        <section className="grid gap-6 rounded-3xl border border-border bg-card/70 p-5 shadow-lg sm:p-8" aria-label="External playback">
          <div className="grid gap-2">
            <p className="m-0 text-xs font-medium tracking-[0.16em] text-primary uppercase">
              External playback
            </p>
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
      </main>
    </div>
  )
}
