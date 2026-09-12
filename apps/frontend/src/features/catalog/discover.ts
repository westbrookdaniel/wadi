import { z } from 'zod'
import type { CatalogEntry, CatalogExtraDecl, MediaPreview, UserList } from '@/api/types'
import { buildBrowseRowCandidates, catalogRowKey, type BrowseRowCandidate } from './browse-layout'

export const discoverSearchSchema = z.object({
  catalog: z.string().max(512).optional().catch(undefined),
  type: z.string().max(80).optional().catch(undefined),
  filters: z.record(z.string().max(80), z.string().max(512)).optional().catch(undefined),
})
export type DiscoverSearch = z.infer<typeof discoverSearchSchema>
export type DiscoverSource =
  | { kind: 'catalog'; key: string; title: string; addonName: string; entries: CatalogEntry[] }
  | { kind: 'watchlist'; key: string; title: string; list: UserList }

export function discoverSources(catalogs: CatalogEntry[], lists: UserList[]): DiscoverSource[] {
  const browseable = catalogs.filter(entry => !entry.catalog.extra?.some(extra => extra.name === 'search' && extra.isRequired))
  return buildBrowseRowCandidates(browseable, lists).flatMap<DiscoverSource>(row => {
    if (row.kind === 'catalog' && row.catalogEntry) return [{ kind: 'catalog', key: row.key, title: row.title, addonName: row.catalogEntry.addon_name, entries: row.catalogEntries ?? [row.catalogEntry] }]
    if (row.kind === 'watchlist' && row.list) return [{ kind: 'watchlist', key: row.key, title: row.title, list: row.list }]
    return []
  })
}

export function discoverSearchForRow(row: BrowseRowCandidate): DiscoverSearch {
  const entries = row.catalogEntries ?? (row.catalogEntry ? [row.catalogEntry] : [])
  return { catalog: row.key, type: entries.length === 1 ? entries[0]?.catalog.type : undefined }
}

export function discoverFilters(entries: CatalogEntry[]): CatalogExtraDecl[] {
  const first = entries[0]?.catalog.extra ?? []
  return first.filter(extra => !['skip', 'search'].includes(extra.name) && entries.every(entry => entry.catalog.extra?.some(item => item.name === extra.name))).map(extra => {
    const declarations = entries.flatMap(entry => entry.catalog.extra?.filter(item => item.name === extra.name) ?? [])
    const options = extra.options?.filter(option => declarations.every(item => !item.options || item.options.includes(option)))
    return { ...extra, isRequired: declarations.some(item => item.isRequired), options }
  })
}

export function mediaKey(item: MediaPreview) { return `${item.type}:${item.id}` }
export function interleaveMedia(groups: MediaPreview[][]): MediaPreview[] {
  const seen = new Set<string>()
  return Array.from({ length: Math.max(0, ...groups.map(group => group.length)) }).flatMap((_, index) => groups.flatMap(group => {
    const item = group[index]
    if (!item || seen.has(mediaKey(item))) return []
    seen.add(mediaKey(item)); return [item]
  }))
}

export type DiscoverPage = { key: string; items: MediaPreview[]; offset: number; paged: boolean }[]
export function nextDiscoverPage(last: DiscoverPage, pages: DiscoverPage[]): Record<string, number> | undefined {
  const next: Record<string, number> = {}
  for (const source of last) {
    if (!source.paged || !source.items.length) continue
    const seen = new Set(pages.slice(0, -1).flatMap(page => page.filter(item => item.key === source.key).flatMap(item => item.items.map(mediaKey))))
    if (source.items.some(item => !seen.has(mediaKey(item)))) next[source.key] = source.offset + source.items.length
  }
  return Object.keys(next).length ? next : undefined
}

export function initialDiscoverPage(entries: CatalogEntry[]): Record<string, number> {
  return Object.fromEntries(entries.map(entry => [catalogRowKey(entry), 0]))
}
