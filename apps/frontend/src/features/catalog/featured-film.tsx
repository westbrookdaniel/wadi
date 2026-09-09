import { useQuery } from '@tanstack/react-query'
import { Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { catalogQuery } from '@/api/queries'
import type { CatalogEntry, MediaPreview } from '@/api/types'
import { Artwork } from '@/components/artwork'

export function FeaturedFilm({ entry, onOpen }: { entry: CatalogEntry; onOpen: (media: MediaPreview) => void }) {
  const query = useQuery(catalogQuery(entry.catalog.type, entry.catalog.id, {}))
  const films = (query.data ?? []).filter(item => item.background || item.poster).slice(0, 6)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [interacting, setInteracting] = useState(false)
  useEffect(() => {
    if (paused || interacting || films.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex(current => (current + 1) % films.length)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [films.length, paused, interacting])
  const film = films[index % Math.max(1, films.length)]
  if (!film) return null
  return (
    <section className="featured-film" aria-label="Suggestions" onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)} onFocus={() => setInteracting(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false) }}>
      <div key={`${film.type}:${film.id}`} className="featured-film-slide">
        <Artwork className="featured-film-art" src={film.background ?? film.poster} eager />
        <div className="featured-film-shade" />
        <div className="featured-film-copy">
          <p className="mb-4 text-xs font-medium tracking-widest text-white/60 uppercase">Something to watch</p>
          <h2 className="max-w-lg text-[clamp(1.8rem,3vw,3rem)] leading-[1.08] font-semibold tracking-tight text-white">{film.name}</h2>
          <p className="mt-3 text-xs text-white/65">{[film.releaseInfo, film.type === 'series' ? 'Series' : 'Film'].filter(Boolean).join(' · ')}</p>
          {film.description ? <p className="mt-3 max-w-md text-[13px] leading-6 text-white/70 line-clamp-2">{film.description}</p> : null}
          <button type="button" onClick={() => onOpen(film)} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-xs font-semibold text-black hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
            <Play className="size-3.5 fill-current" aria-hidden="true" /> Explore
          </button>
        </div>
      </div>
      {films.length > 1 ? <div className="absolute bottom-5 right-5 z-10 flex items-center gap-2">
        {films.map((item, position) => <button key={`${item.type}:${item.id}`} type="button" aria-label={`Show ${item.name}`} aria-pressed={position === index % films.length} onClick={() => { setIndex(position); setPaused(true) }} className="flex h-7 items-center px-1"><span className={`h-1 rounded-full transition-all ${position === index % films.length ? 'w-6 bg-white' : 'w-2 bg-white/35'}`} /></button>)}
        <button type="button" aria-label={paused ? 'Play suggestions' : 'Pause suggestions'} onClick={() => setPaused(value => !value)} className="p-2 text-white/70">{paused ? <Play className="size-3" /> : <Pause className="size-3" />}</button>
      </div> : null}
    </section>
  )
}
