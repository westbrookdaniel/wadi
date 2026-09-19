import { lazy, Suspense, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { playbackPreferencesQuery } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { getStreamUrl } from './stream-playback'
import type { PlaybackTarget, PlayableStream } from './types'
const MediaPlayerPage = lazy(() => import('./player').then(module => ({ default: module.MediaPlayerPage })))
function ExternalPlaybackPage({ media, stream, target, onBack }: {
  media: MediaPreview; stream: PlayableStream; target: PlaybackTarget;
  onPlaybackChange?: (stream: PlayableStream, target: PlaybackTarget) => void;
  onBack: () => void;
}) {
  const url = getStreamUrl(stream)
  const [status, setStatus] = useState('')
  return <Dialog open onOpenChange={open => { if (!open) onBack() }}>
    <DialogContent className="sm:max-w-lg">
      <DialogTitle>{media.name}</DialogTitle>
      <DialogDescription>{target.episodeContext?.title ?? 'Copy stream link'}</DialogDescription>
      <textarea aria-label="Stream link" readOnly value={url ?? ''} rows={3} className="w-full resize-none rounded-lg border border-border p-3 text-sm [overflow-wrap:anywhere]" onFocus={event => event.currentTarget.select()} />
      <p role="status" className="text-sm text-muted-foreground">{status || (!url ? 'This stream has no link to copy.' : '')}</p>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onBack}>Back</Button><Button disabled={!url} onClick={() => {
        if (url) void navigator.clipboard?.writeText(url).then(() => setStatus('Copied')).catch(() => setStatus('Select the link and copy it manually.'))
        if (!navigator.clipboard) setStatus('Select the link and copy it manually.')
      }}>{status === 'Copied' ? 'Copied' : 'Copy link'}</Button></div>
    </DialogContent>
  </Dialog>
}
export function StreamPlaybackPage(props: Parameters<typeof ExternalPlaybackPage>[0]) {
  const prefs = useQuery(playbackPreferencesQuery)
  if (prefs.isLoading) return <div className="p-8">Loading playback preferences…</div>
  if (prefs.data?.stream_action !== 'internal') return <ExternalPlaybackPage {...props} />
  return props.stream.url && /^https?:\/\//i.test(props.stream.url) ? <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-black text-white" role="status">Opening player…</div>}><MediaPlayerPage key={`${props.target.videoId ?? props.target.mediaId}:${props.stream.url}`} {...props} /></Suspense> : <ExternalPlaybackPage {...props} />
}
