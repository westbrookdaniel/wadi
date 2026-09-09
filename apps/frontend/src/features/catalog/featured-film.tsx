import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Play } from 'lucide-react'
import { catalogQuery } from '@/api/queries'
import type { CatalogEntry, MediaPreview } from '@/api/types'

export function FeaturedFilm({ entry, onOpen }: { entry: CatalogEntry; onOpen: (media: MediaPreview) => void }) {
  const query = useQuery(catalogQuery(entry.catalog.type, entry.catalog.id, {}))
  const film = query.data?.find(item => item.background || item.poster)
  if (!film) return null
  return (
    <section className="featured-film" aria-label={`Featured: ${film.name}`}>
      <img className="featured-film-art" src={film.background ?? film.poster ?? undefined} alt="" fetchPriority="high" />
      <div className="featured-film-shade" />
      <div className="featured-film-copy">
        <h1 className="max-w-3xl text-[clamp(2.5rem,6vw,5.5rem)] leading-[1.03] font-semibold tracking-[-0.055em] text-white">{film.name}</h1>
        <p className="mt-5 text-sm text-white/65">{[film.releaseInfo, film.type === 'series' ? 'Series' : 'Film'].filter(Boolean).join(' · ')}</p>
        {film.description ? <p className="mt-4 max-w-xl text-sm leading-7 text-white/75 line-clamp-3 sm:text-base">{film.description}</p> : null}
        <button type="button" onClick={() => onOpen(film)} className="mt-7 inline-flex items-center gap-3 rounded-md bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          <Play className="size-4 fill-current" aria-hidden="true" /> Watch now <ArrowUpRight className="ml-4 size-4" aria-hidden="true" />
        </button>
      </div>
    </section>
  )
}
