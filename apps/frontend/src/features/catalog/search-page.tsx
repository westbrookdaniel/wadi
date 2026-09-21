import { useTvPageState } from '@/components/tv/use-tv-page-state'
import { useQueries, useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { useRef } from 'react'

import { catalogQuery, catalogsQuery } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { EmptyState, ErrorState } from '@/components/status'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { MediaCard } from '@/features/media/media-card'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { mediaGrid, pageStack } from '@/lib/styles'
import { cn } from '@/lib/utils'

import { rankMediaByQuery } from './fuzzy-search'

export function SearchPage({ onOpenMedia }: { onOpenMedia: (media: MediaPreview) => void }) {
  const searchInput = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useTvPageState('search-query', '')
  const debouncedQuery = useDebouncedValue(query.trim())
  const catalogs = useQuery(catalogsQuery)
  const searchable = (catalogs.data ?? []).filter((entry) =>
    entry.catalog.extra?.some((extra) => extra.name === 'search'),
  )

  const results = useQueries({
    queries: searchable.map((entry) =>
      catalogQuery(entry.catalog.type, entry.catalog.id, { search: debouncedQuery }, debouncedQuery.length > 1),
    ),
  })

  const media = rankMediaByQuery(results.flatMap((result) => result.data ?? []), debouncedQuery).map(entry => entry.item)
  const [filter, setFilter] = useTvPageState('search-filter', 'all')
  const visibleMedia = media.filter(item => filter === 'all' || item.type === filter)
  const isSearching = results.some((result) => result.isLoading)

  return (
    <div className={pageStack} data-tv-loading={isSearching || catalogs.isLoading ? '' : undefined}>
      <div className="flex min-h-[52px] w-[min(760px,100%)] items-center gap-2.5 rounded-xl border border-border bg-card/60 px-[18px] shadow-sm ring-1 ring-foreground/5">
        <Search className="size-[18px] text-muted-foreground" aria-hidden="true" />
        <Input
          ref={searchInput}
          className="min-h-[50px] border-0 bg-transparent px-0 focus-visible:ring-0 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          type="search"
          aria-label="Search films and series"
          maxLength={120}
          placeholder="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); searchInput.current?.focus() }} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" aria-hidden="true" /></button>}
      </div>

      {debouncedQuery.length > 1 ? <div className="flex flex-wrap items-center gap-2">
        {[['all', 'All'], ['movie', 'Films'], ['series', 'Series']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value ?? 'all')} className={`rounded-lg border px-4 py-2 text-xs transition focus-visible:outline-2 focus-visible:outline-ring ${filter === value ? 'border-border bg-white text-black' : 'border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{label}</button>)}
        <p className="ml-2 text-xs text-muted-foreground" role="status">{isSearching ? 'Searching catalogs…' : `${visibleMedia.length} results`}</p>
      </div> : null}
      {results.find(result => result.error)?.error ? <ErrorState error={results.find(result => result.error)?.error} /> : null}
      {catalogs.isLoading ? <CatalogSearchSkeleton /> : null}
      {catalogs.error ? <ErrorState error={catalogs.error} /> : null}
      {!catalogs.isLoading && !searchable.length ? (
        <EmptyState title="No searchable catalogs" body="Install an addon with catalog search support." />
      ) : null}
      {isSearching && !media.length ? <SearchResultsSkeleton /> : null}
      {debouncedQuery.length > 1 && !isSearching && !visibleMedia.length ? <EmptyState title="No results found" /> : null}

      {visibleMedia.length ? (
        <div className={cn(mediaGrid, 'mt-2')}>
          {visibleMedia.map((item) => (
            <MediaCard key={`${item.type}-${item.id}`} media={item} onOpen={() => onOpenMedia(item)} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function CatalogSearchSkeleton() {
  return (
    <div className="grid w-[min(520px,100%)] gap-3" role="status" aria-label="Loading searchable catalogs">
      <Skeleton className="h-4 w-36 rounded-full" />
      <Skeleton className="h-9 w-full rounded-full" />
      <Skeleton className="h-9 w-[72%] rounded-full" />
    </div>
  )
}

function SearchResultsSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className={cn(mediaGrid, 'mt-2')} role="status" aria-label="Searching">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton className="aspect-[2/3] rounded-lg" key={index} />
      ))}
    </div>
  )
}
