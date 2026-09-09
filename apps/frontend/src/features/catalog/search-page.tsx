import { useQueries, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'

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
  const [query, setQuery] = useState('')
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
  const [filter, setFilter] = useState('all')
  const visibleMedia = media.filter(item => filter === 'all' || item.type === filter)
  const isSearching = results.some((result) => result.isLoading)

  return (
    <div className={pageStack}>
      <div><h1 className="text-3xl font-medium tracking-tight">Search</h1><p className="mt-2 text-sm text-muted-foreground">Find a film, series, or a title you almost remember.</p></div>
      <label className="flex min-h-[52px] w-[min(760px,100%)] items-center gap-2.5 rounded-full border border-border bg-card/60 px-[18px] shadow-sm ring-1 ring-foreground/5">
        <Search className="size-[18px] text-muted-foreground" aria-hidden="true" />
        <Input
          className="min-h-[50px] border-0 bg-transparent px-0 focus-visible:ring-0"
          type="search"
          aria-label="Search films and series"
          maxLength={120}
          placeholder="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {debouncedQuery.length > 1 ? <div className="flex flex-wrap items-center gap-2">
        {[['all', 'All'], ['movie', 'Films'], ['series', 'Series']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value ?? 'all')} className={`rounded-full px-4 py-2 text-xs transition ${filter === value ? 'bg-white text-black' : 'bg-white/5 text-muted-foreground hover:bg-white/10'}`}>{label}</button>)}
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
