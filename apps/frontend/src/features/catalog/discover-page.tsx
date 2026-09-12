import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { catalogsQuery, fetchCatalogItems, listItemsQuery, listsQuery } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SettingsSelect } from '@/components/ui/settings-select'
import { MediaCard } from '@/features/media/media-card'
import { mediaGrid, pageStack } from '@/lib/styles'
import { catalogRowKey } from './browse-layout'
import { discoverFilters, discoverSources, initialDiscoverPage, interleaveMedia, nextDiscoverPage, type DiscoverPage, type DiscoverSearch } from './discover'

export function DiscoverPage({ search, onChange, onOpenMedia }: {
  search: DiscoverSearch
  onChange: (search: DiscoverSearch) => void
  onOpenMedia: (media: MediaPreview) => void
}) {
  const catalogs = useQuery(catalogsQuery)
  const lists = useQuery(listsQuery)
  const sources = discoverSources(catalogs.data ?? [], lists.data ?? [])
  const types = [...new Set(['movie', 'series', ...(catalogs.data ?? []).map(entry => entry.catalog.type)])]
  const type = search.type && types.includes(search.type) ? search.type : ''
  const availableSources = sources.filter(source => source.kind === 'watchlist' || !type || source.entries.some(entry => entry.catalog.type === type))
  const source = availableSources.find(source => source.key === search.catalog) ?? availableSources[0]
  const entries = source?.kind === 'catalog' ? source.entries.filter(entry => !type || entry.catalog.type === type) : []
  const filters = discoverFilters(entries)
  const values = Object.fromEntries(filters.map(filter => {
    const requested = search.filters?.[filter.name]
    const valid = requested && (!filter.options || filter.options.includes(requested)) ? requested : undefined
    return [filter.name, valid ?? (filter.isRequired ? filter.options?.[0] ?? '' : '')]
  }))
  const missing = filters.find(filter => filter.isRequired && !values[filter.name])
  const extras = Object.fromEntries(Object.entries(values).filter(([, value]) => value))
  // A required addon input must never be silently dropped from the request.
  const incomplete = entries.some(entry => entry.catalog.extra?.some(extra => extra.isRequired && extra.name !== 'skip' && !extras[extra.name]))
  const items = useInfiniteQuery({
    queryKey: ['discover', source?.key, type, extras],
    initialPageParam: initialDiscoverPage(entries),
    queryFn: async ({ pageParam, signal }): Promise<DiscoverPage> => Promise.all(entries.filter(entry => catalogRowKey(entry) in pageParam).map(async entry => {
      const key = catalogRowKey(entry), offset = pageParam[key] ?? 0
      const paged = Boolean(entry.catalog.extra?.some(extra => extra.name === 'skip'))
      return { key, offset, paged, items: await fetchCatalogItems(entry.catalog.type, entry.catalog.id, { ...extras, addon_id: entry.addon_id, ...(paged ? { skip: String(offset) } : {}) }, signal) }
    })),
    getNextPageParam: nextDiscoverPage,
    enabled: entries.length > 0 && !incomplete,
  })
  const listItems = useQuery(listItemsQuery(source?.kind === 'watchlist' ? source.list.id : null))
  const catalogItems = interleaveMedia(entries.map(entry => items.data?.pages.flatMap(page => page.filter(result => result.key === catalogRowKey(entry)).flatMap(result => result.items)) ?? []))
  const visible: MediaPreview[] = source?.kind === 'watchlist'
    ? (listItems.data ?? []).filter(item => !type || item.media_type === type).map(item => ({ id: item.media_id, type: item.media_type, name: item.title, poster: item.poster ?? undefined, releaseInfo: item.release_info ?? undefined, raw: item.meta ?? {} }))
    : catalogItems
  const loading = catalogs.isLoading || lists.isLoading || (source?.kind === 'watchlist' ? listItems.isLoading : items.isLoading)
  const error = catalogs.error ?? lists.error ?? (source?.kind === 'watchlist' ? listItems.error : items.error)
  const change = (next: DiscoverSearch) => { window.scrollTo({ top: 0 }); onChange(next) }

  return <div className={pageStack}>
    <h1 className="m-0 leading-tight">Discover</h1>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid w-44 gap-1.5 text-sm">Content
        <SettingsSelect aria-label="Content type" value={type} onValueChange={value => change({ catalog: source?.key, type: value || undefined })}>
          <option value="">All</option>
          {types.map(value => <option key={value} value={value}>{typeLabel(value)}</option>)}
        </SettingsSelect>
      </label>
      <label className="grid w-[min(100%,360px)] gap-1.5 text-sm">Catalog
        <SettingsSelect aria-label="Catalog" value={source?.key ?? ''} disabled={!availableSources.length} onValueChange={catalog => change({ type: type || undefined, catalog })}>
          {!availableSources.length ? <option value="">No catalogs</option> : null}
          {availableSources.map(item => <option key={item.key} value={item.key}>{item.title}{item.kind === 'catalog' ? ` · ${item.addonName}` : ' · Your lists'}</option>)}
        </SettingsSelect>
      </label>
      {filters.map(filter => <label key={filter.name} className="grid w-48 gap-1.5 text-sm">{typeLabel(filter.name)}
        {filter.options ? <SettingsSelect aria-label={typeLabel(filter.name)} value={values[filter.name] ?? ''} onValueChange={value => change({ catalog: source?.key, type: type || undefined, filters: { ...extras, [filter.name]: value } })}>
          {!filter.isRequired ? <option value="">All</option> : null}
          {filter.options.map(option => <option key={option} value={option}>{option}</option>)}
        </SettingsSelect> : <Input aria-label={typeLabel(filter.name)} value={values[filter.name] ?? ''} onChange={event => change({ catalog: source?.key, type: type || undefined, filters: { ...extras, [filter.name]: event.target.value } })} />}
      </label>)}
    </div>
    {loading ? <LoadingState label="Loading titles" /> : null}
    {error ? <ErrorState error={error} /> : null}
    {incomplete ? <EmptyState title={missing ? `Choose ${missing.name} to browse` : 'Choose a content type to use this catalog’s filters'} /> : null}
    {!loading && !error && !incomplete && !visible.length ? <EmptyState title={sources.length ? 'No titles found' : 'No catalogs installed'} body={sources.length ? 'Try another catalog or filter.' : 'Add an addon in Settings to start discovering.'} /> : null}
    <div className={mediaGrid}>{visible.map(media => <MediaCard key={`${media.type}:${media.id}`} media={media} onOpen={() => onOpenMedia(media)} />)}</div>
    {source?.kind === 'catalog' && items.hasNextPage ? <div className="flex justify-center"><Button variant="outline" disabled={items.isFetchingNextPage} onClick={() => void items.fetchNextPage()}>{items.isFetchingNextPage ? 'Loading…' : 'Load more'}</Button></div> : null}
  </div>
}
function typeLabel(value: string) { return value === 'movie' ? 'Movies' : value === 'series' ? 'Series' : value.charAt(0).toUpperCase() + value.slice(1) }
