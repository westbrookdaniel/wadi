import { describe, expect, it } from 'vitest'
import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router'
import type { CatalogEntry, MediaPreview } from '@/api/types'
import { buildBrowseRowCandidates, resolveVisibleBrowseRows } from './browse-layout'
import { discoverFilters, discoverSearchForRow, discoverSearchSchema, discoverSources, interleaveMedia, nextDiscoverPage } from './discover'

const movie: CatalogEntry = { addon_id: 'a', addon_name: 'Addon', catalog: { id: 'popular', type: 'movie', name: 'Popular', extra: [{ name: 'skip' }, { name: 'genre', options: ['Action', 'Comedy'] }] } }
const series: CatalogEntry = { ...movie, catalog: { ...movie.catalog, id: 'popular-series', type: 'series' } }
const media = (id: string, type = 'movie'): MediaPreview => ({ id, type, name: id, raw: {} })

describe('Discover selections and pagination', () => {
  it('matches combined Home rows, their per-row content settings and addon identity', () => {
    const catalogs = [movie, series, { ...movie, addon_id: 'other' }]
    const rows = buildBrowseRowCandidates(catalogs, [])
    const combined = rows[1]!
    const selection = discoverSearchForRow(combined)
    expect(discoverSources(catalogs, []).find(source => source.key === selection.catalog)).toMatchObject({ entries: [movie, series] })
    expect(selection.type).toBeUndefined()
    const filtered = resolveVisibleBrowseRows(rows, { order: [], hidden: [], catalogModes: { [combined.key]: 'series' } })[1]!
    expect(discoverSearchForRow(filtered)).toEqual({ catalog: combined.key, type: 'series' })
    expect(discoverSources(catalogs, [])).toHaveLength(2)
  })
  it('round-trips filters through a detail-page return URL', () => {
    const search = { catalog: 'catalog:a:movie:popular', type: 'movie', filters: { genre: 'Science Fiction', year: '2026' } }
    expect(discoverSearchSchema.parse(defaultParseSearch(defaultStringifySearch(search)))).toEqual(search)
  })
  it('uses only filters shared by the selected catalog types', () => {
    expect(discoverFilters([movie, series])).toEqual([{ name: 'genre', options: ['Action', 'Comedy'], isRequired: false }])
    expect(discoverFilters([movie, { ...series, catalog: { ...series.catalog, extra: [] } }])).toEqual([])
  })
  it('deduplicates within a content type while preserving combined row order', () => {
    expect(interleaveMedia([[media('1'), media('2')], [media('1', 'series'), media('2')]]).map(item => `${item.type}:${item.id}`)).toEqual(['movie:1', 'series:1', 'movie:2'])
  })
  it('stops addons which ignore pagination and keeps paging sources with new results', () => {
    const first = [{ key: 'a', items: [media('1'), media('2')], offset: 0, paged: true }, { key: 'b', items: [media('3')], offset: 0, paged: true }]
    expect(nextDiscoverPage(first, [first])).toEqual({ a: 2, b: 1 })
    const second = [{ key: 'a', items: [media('1'), media('2')], offset: 2, paged: true }, { key: 'b', items: [media('4')], offset: 1, paged: true }]
    expect(nextDiscoverPage(second, [first, second])).toEqual({ b: 2 })
    expect(nextDiscoverPage([{ key: 'b', items: [], offset: 2, paged: true }], [first, second])).toBeUndefined()
    expect(nextDiscoverPage([{ ...first[0]!, paged: false }], [first])).toBeUndefined()
  })
})
