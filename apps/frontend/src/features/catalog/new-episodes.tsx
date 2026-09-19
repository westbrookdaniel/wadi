import { useContext, useState } from 'react'
import { CalendarDays, Play } from 'lucide-react'
import type { MediaPreview } from '@/api/types'
import { Artwork } from '@/components/artwork'
import { Button } from '@/components/ui/button'
import { contentSection, sectionHeading } from '@/lib/styles'
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
    <div className={sectionHeading}>
      <div><h2 className="m-0 tracking-normal">New episodes</h2><p className="mt-1 text-sm text-muted-foreground">{showCalendar ? 'Coming in the next seven days' : `Unwatched releases · Last ${preferences.days} days`}</p></div>
      {preferences.showCalendar && <Button variant={showCalendar ? 'secondary' : 'ghost'} className="shrink-0" onClick={() => setCalendar(!calendar)}><CalendarDays className="size-4" />{showCalendar ? 'Recent' : 'Calendar'}</Button>}
    </div>
    {!visible.length && <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">{loading ? 'Checking episode releases…' : showCalendar ? 'No confirmed upcoming dates for shows in your lists.' : 'You’re caught up. Add shows to your lists to follow their releases.'}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {visible.slice(0, expanded ? 100 : 6).map(({ show, episode }) => <button key={`${show.media_id}:${episode.id}`} className="group flex min-w-0 items-center gap-4 rounded-xl border border-border bg-card/60 p-3 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring" onClick={() => onOpenMedia({ id: show.media_id, type: 'series', name: show.title, poster: show.poster ?? undefined, raw: { id: show.media_id, type: 'series' } }, showCalendar ? null : episode.id)}>
        <Artwork src={episode.thumbnail ?? show.poster ?? undefined} className="h-24 w-16 shrink-0 overflow-hidden rounded-md" />
        <div className="min-w-0 flex-1"><p className="text-xs font-medium text-primary">{episode.released ? new Date(episode.released).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: episode.releasePrecision === 'date' ? 'UTC' : undefined }) : ''}{showCalendar && episode.releasePrecision === 'date' ? ' · Time unconfirmed' : ''}</p><h3 className="mt-1 text-sm font-medium">{show.title}</h3><p className="mt-1 text-xs text-muted-foreground">S{episode.season ?? '?'} · E{episode.episode ?? '?'} — {episode.title}</p></div>
        {!showCalendar && <Play className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />}
      </button>)}
    </div>
    {visible.length > 6 && <Button variant="ghost" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show fewer' : `See all (${visible.length})`}</Button>}
    {incomplete && <p className="text-xs text-muted-foreground">Some release information is unavailable or out of date. Up to 50 shows are tracked; choose a smaller list in Home settings.</p>}
  </section>
}
