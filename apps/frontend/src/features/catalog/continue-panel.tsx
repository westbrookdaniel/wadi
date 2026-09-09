import { useQuery } from '@tanstack/react-query'
import { metaQuery } from '@/api/queries'
import type { ContinueWatchingItem, MediaPreview } from '@/api/types'
import { Artwork } from '@/components/artwork'
import { mediaPreviewFromMeta } from './media-preview'

export function ContinuePanel({ items, onOpen }: { items: ContinueWatchingItem[]; onOpen: (media: MediaPreview, videoId?: string | null) => void }) {
  if (!items.length) return null
  return <section className="continue-panel" aria-label="Continue Watching">
    <h2 className="text-sm font-medium text-muted-foreground">Continue Watching</h2>
    <div className="mt-3 grid content-start gap-2 overflow-y-auto pr-1">
      {items.map(item => <ContinueItem key={`${item.media_type}:${item.media_id}:${item.video_id}`} item={item} onOpen={onOpen} />)}
    </div>
  </section>
}
function ContinueItem({ item, onOpen }: { item: ContinueWatchingItem; onOpen: (media: MediaPreview, videoId?: string | null) => void }) {
  const query = useQuery(metaQuery(item.media_type, item.media_id))
  const media = mediaPreviewFromMeta(item, query.data)
  const progress = item.duration_seconds && item.duration_seconds > 0 ? Math.min(100, item.position_seconds / item.duration_seconds * 100) : 0
  return <button type="button" disabled={!media} onClick={() => media && onOpen(media, item.video_id)} className="group flex min-w-0 items-center gap-3 rounded-lg p-1 text-left transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-primary" aria-label={media ? `Continue ${media.name}` : 'Loading title'}>
    <Artwork src={media?.poster} className="h-24 w-16 shrink-0 rounded-md" />
    <div className="min-w-0 flex-1"><h3 className="line-clamp-2 text-sm font-medium">{media?.name ?? 'Loading title…'}</h3><p className="mt-1.5 text-xs text-muted-foreground">{item.duration_seconds ? `${Math.max(0, Math.ceil((item.duration_seconds - item.position_seconds) / 60))} min left` : 'Ready to continue'}</p><div className="mt-3 h-1 w-full max-w-48 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div></div>
  </button>
}
