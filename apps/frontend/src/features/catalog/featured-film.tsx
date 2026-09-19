import { useQuery } from '@tanstack/react-query'
import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { catalogQuery } from '@/api/queries'
import type { CatalogEntry, MediaPreview } from '@/api/types'
import { Skeleton } from '@/components/ui/skeleton'
import { Artwork } from '@/components/artwork'

export function FeaturedFilm({ entry, onOpen, rotate = true }: { entry: CatalogEntry; onOpen: (media: MediaPreview) => void; rotate?: boolean }) {
  const query = useQuery(catalogQuery(entry.catalog.type, entry.catalog.id, { addon_id: entry.addon_id }))
  return <FeaturedTitles items={query.data ?? []} loading={query.isLoading} failed={Boolean(query.error)} onOpen={onOpen} rotate={rotate} />
}
export function FeaturedTitles({ items, loading = false, failed = false, onOpen, rotate = true }: { items: MediaPreview[]; loading?: boolean; failed?: boolean; onOpen: (media: MediaPreview) => void; rotate?: boolean }) {
  const films = items.filter(item => item.background || item.poster).slice(0, 6)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [interacting, setInteracting] = useState(false)
  useEffect(() => {
    if (!rotate || paused || interacting || films.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex(current => (current + 1) % films.length)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [films.length, paused, interacting, rotate])
  const film = films[index % Math.max(1, films.length)]
  if (!film) return <section className="featured-film !bg-muted" aria-label={loading ? 'Loading suggestions' : 'No suggestions available'}>{loading ? <Skeleton className="absolute inset-0 rounded-[14px]" /> : <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">{failed ? 'Suggestions are temporarily unavailable.' : 'No suggestions available.'}</p>}</section>
  return (
    <section className="featured-film" aria-label="Suggestions" onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)} onFocus={() => setInteracting(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false) }}>
      <div key={`${film.type}:${film.id}`} className="featured-film-slide">
        <Artwork className="featured-film-art" src={film.background ?? film.poster} eager />
        <div className="featured-film-shade" />
        <div className="featured-film-copy">
          <h2 className="max-w-lg text-[clamp(1.8rem,3vw,3rem)] leading-[1.08] font-semibold tracking-tight text-white">{film.name}</h2>
          <p className="mt-3 text-xs text-white/65">{[film.releaseInfo, film.type === 'series' ? 'Series' : 'Film'].filter(Boolean).join(' · ')}</p>
          {film.description ? <p className="mt-3 max-w-md text-[13px] leading-6 text-white/70 line-clamp-2">{film.description}</p> : null}
          <button type="button" onClick={() => onOpen(film)} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-black hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            <Play className="size-3.5 fill-current" aria-hidden="true" /> Watch
          </button>
        </div>
      </div>
      {films.length > 1 ? <div className="absolute bottom-5 right-5 z-10 flex items-center gap-2">
        {films.map((item, position) => <button key={`${item.type}:${item.id}`} type="button" aria-label={`Show ${item.name}`} aria-pressed={position === index % films.length} onClick={() => { setIndex(position); setPaused(true) }} className="flex h-7 items-center px-1"><span className={`h-1 rounded-full transition-all ${position === index % films.length ? 'w-6 bg-white' : 'w-2 bg-white/35'}`} /></button>)}
        {rotate ? <button type="button" aria-label={paused ? 'Play suggestions' : 'Pause suggestions'} onClick={() => setPaused(value => !value)} className="p-2 text-white/70">{paused ? <Play className="size-3 fill-current" /> : <Pause className="size-3 fill-current" />}</button> : null}
      </div> : null}
    </section>
  )
}
