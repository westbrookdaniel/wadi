import { useQueries, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useState } from 'react'

import { catalogQuery, catalogsQuery } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { MediaCard } from '@/components/media-card'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { inputClass, mediaGrid, pageStack } from '@/lib/styles'
import { cn } from '@/lib/utils'

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

  const media = results.flatMap((result) => result.data ?? [])
  const isSearching = results.some((result) => result.isLoading)

  return (
    <div className={pageStack}>
      <label className="flex min-h-[52px] w-[min(760px,100%)] items-center gap-2.5 rounded-full border border-[hsl(0_0%_100%/10%)] bg-[hsl(0_0%_100%/6%)] px-[18px] max-[800px]:flex-col max-[800px]:items-stretch">
        <Search className="size-[18px] text-[hsl(240_6%_62%)]" aria-hidden="true" />
        <input
          className={cn(inputClass, 'min-h-[50px] border-0 bg-transparent px-0 focus:outline-0')}
          type="search"
          placeholder="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {catalogs.isLoading ? <LoadingState label="Loading searchable catalogs" /> : null}
      {catalogs.error ? <ErrorState error={catalogs.error} /> : null}
      {!catalogs.isLoading && !searchable.length ? (
        <EmptyState title="No searchable catalogs" body="Install an addon with catalog search support." />
      ) : null}
      {isSearching ? <LoadingState label="Searching" /> : null}
      {debouncedQuery.length > 1 && !isSearching && !media.length ? <EmptyState title="No results found" /> : null}

      {media.length ? (
        <div className={cn(mediaGrid, 'mt-2')}>
          {media.map((item) => (
            <MediaCard key={`${item.type}-${item.id}`} media={item} onOpen={() => onOpenMedia(item)} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
