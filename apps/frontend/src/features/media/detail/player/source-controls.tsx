import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { SettingsSelect } from '@/components/ui/settings-select'
import { StreamList } from '../stream-list'
import { parseStreamMetadata } from '../stream-metadata'
import type { PlaybackTarget, PlayableStream } from '../types'

export function SourceControls({ open, onOpenChange, streams, qualityStreams, loading, error, onRetry, activeStream, quality, onQuality, onSelect, onTryAnother, onSmallerSource, target, keepFamily, onKeepFamily }: {
  open: boolean; onOpenChange: (open: boolean) => void
  qualityStreams: PlayableStream[]
  streams: PlayableStream[]; loading: boolean; error: boolean; onRetry: () => void
  activeStream: PlayableStream; quality: number | null
  onQuality: (resolution: number | null) => void
  onSelect: (stream: PlayableStream) => void
  onSmallerSource?: () => void
  onTryAnother: () => void
  target: PlaybackTarget; keepFamily: boolean; onKeepFamily: (keep: boolean) => void
}) {
  const resolutions = useMemo(() => [...new Set([...qualityStreams, activeStream].flatMap(stream => {
    const resolution = parseStreamMetadata(stream).resolution.value
    return resolution ? [resolution] : []
  }))].sort((a, b) => b - a), [qualityStreams, activeStream])
  const activeResolution = parseStreamMetadata(activeStream).resolution.value
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="dark player-sheet !w-[calc(100vw-2rem)] !max-w-xl max-h-[90dvh] overflow-y-auto">
      <DialogTitle>Quality & sources</DialogTitle>
      <DialogDescription>Changing quality chooses another source and briefly reloads playback at your position. Different edits can have different audio or subtitle timing.</DialogDescription>
      <label className="grid gap-2 text-sm">Quality<SettingsSelect aria-label="Playback quality" value={quality === null ? 'auto' : String(quality)} disabled={loading || error} onValueChange={value => onQuality(value === 'auto' ? null : Number(value))}>
        <option value="auto">Auto{activeResolution ? ` · currently ${activeResolution}p` : ''}</option>
        {resolutions.map(resolution => <option key={resolution} value={resolution}>{resolution === 2160 ? '4K / 2160p' : `${resolution}p`}</option>)}
      </SettingsSelect></label>
      <p className="text-xs text-muted-foreground">Auto uses your playback preferences to choose a source. It does not continuously adapt to bandwidth.</p>
      {target.mediaType === 'series' && parseStreamMetadata(activeStream).bingeGroup.value ? <label className="flex items-center justify-between gap-3 text-sm">Keep this release family for the season on this device<input type="checkbox" checked={keepFamily} onChange={event => onKeepFamily(event.target.checked)} /></label> : null}
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={loading} onClick={onTryAnother}>Try another source</Button>
      <Button variant="secondary" disabled={loading || !onSmallerSource} onClick={onSmallerSource}>Buffering? Try a smaller source</Button></div>
      <p className="text-sm text-muted-foreground">Wrong audio or subtitle timing? Try another version below, or use the player’s audio and subtitle controls.</p>
      {error ? <div role="alert"><p>Could not load sources.</p><Button onClick={onRetry}>Retry</Button></div> : <StreamList target={target} autoPickAllowed={false} streams={streams} isLoading={loading} onPlay={onSelect} />}
    </DialogContent>
  </Dialog>
}
