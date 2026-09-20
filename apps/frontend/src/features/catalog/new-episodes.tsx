import { useContext, useState } from 'react'
import { ArrowRight, CalendarDays } from 'lucide-react'
import type { MediaPreview } from '@/api/types'
import { Artwork } from '@/components/artwork'
import { contentSection, sectionAction, sectionHeading } from '@/lib/styles'
import { cn } from '@/lib/utils'
import { ReleaseContext } from './release-feed'

export function NewEpisodesSection({ onOpenMedia }: { onOpenMedia: (media: MediaPreview, videoId?: string | null) => void }) {
  const { releases, loading, incomplete, preferences } = useContext(ReleaseContext)
  const [calendar, setCalendar] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const showCalendar = calendar && preferences.showCalendar
  const upcoming = releases.filter(item => item.episode.releaseState === 'upcoming')
  const recent = releases.filter(item => item.episode.releaseState === 'released' && !item.episode.watched).reverse()
  const visible = showCalendar ? upcoming : recent
  return <section className={contentSection}>
    <div className={cn(sectionHeading, 'flex-wrap items-start')}>
      <div className="grid gap-1">
        <h2 className="m-0 tracking-normal">New episodes</h2>
        <p className="m-0 text-sm text-muted-foreground">{showCalendar ? 'Coming in the next seven days' : `Unwatched releases · Last ${preferences.days} days`}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {visible.length > 6 && <button type="button" className={sectionAction} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer' : <>See all<ArrowRight className="size-3.5" aria-hidden="true" /></>}</button>}
        {preferences.showCalendar && <button type="button" className={sectionAction} onClick={() => setCalendar(!calendar)}><CalendarDays className="size-3.5" aria-hidden="true" />{showCalendar ? 'Recent' : 'Upcoming'}</button>}
      </div>
    </div>
    {!visible.length && <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">{loading ? 'Checking episode releases…' : showCalendar ? 'No confirmed upcoming dates for shows in your lists.' : 'You’re caught up. Add shows to your lists to follow their releases.'}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visible.slice(0, expanded ? visible.length : 6).map(({ show, episode }) => <button type="button" key={`${show.media_id}:${episode.id}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card/60 p-2.5 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onOpenMedia({ id: show.media_id, type: 'series', name: show.title, poster: show.poster ?? undefined, raw: { id: show.media_id, type: 'series' } }, showCalendar ? null : episode.id)}>
        <Artwork src={episode.thumbnail ?? show.poster ?? undefined} className="aspect-video w-28 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1"><p className="text-xs font-medium text-primary">{episode.released ? new Date(episode.released).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: episode.releasePrecision === 'date' ? 'UTC' : undefined }) : ''}{showCalendar && episode.releasePrecision === 'date' ? ' · Time unconfirmed' : ''}</p><h3 className="mt-0.5 truncate text-sm font-medium">{show.title}</h3><p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">S{episode.season ?? '?'} · E{episode.episode ?? '?'} — {episode.title}</p></div>
      </button>)}
    </div>
    {incomplete && <p className="text-xs text-muted-foreground">Some release information is unavailable or out of date. Up to 50 shows are tracked; choose a smaller list in Home settings.</p>}
  </section>
}
