import type { CatalogEntry, ListItem, UserList } from '@/api/types'
import { describe, expect, it } from 'vitest'

import {
  CONTINUE_WATCHING_ROW_KEY,
  buildBrowseRowCandidates,
  filterWatchlistItemsForPage,
  normalizeBrowseLayoutPage,
  resolveVisibleBrowseRows,
} from './browse-layout'

function catalog(id: string, type: 'movie' | 'series'): CatalogEntry {
  return {
    addon_id: `addon-${id}`,
    addon_name: `Addon ${id}`,
    catalog: {
      type,
      id,
      name: `${type}-${id}`,
    },
  }
}

function list(id: string, name = `List ${id}`): UserList {
  return {
    id,
    name,
    description: null,
    is_default: false,
    created_at: '',
    updated_at: '',
  }
}

function item(id: string, mediaType: 'movie' | 'series'): ListItem {
  return {
    id,
    list_id: 'list-1',
    addon_id: null,
    media_type: mediaType,
    media_id: `${mediaType}-${id}`,
    video_id: null,
    title: `${mediaType} ${id}`,
    poster: null,
    release_info: null,
    meta: null,
    created_at: '',
  }
}

describe('browse-layout helpers', () => {
  it('applies order, hidden, and appends new rows at the end', () => {
    const candidates = buildBrowseRowCandidates(
      'home',
      [catalog('a', 'movie'), catalog('b', 'series')],
      [list('one')],
    )
    const page = normalizeBrowseLayoutPage({
      order: ['watchlist:one', 'catalog:addon-a:movie:a'],
      hidden: ['catalog:addon-a:movie:a'],
    })

    const visible = resolveVisibleBrowseRows(candidates, page)

    expect(visible.map((row) => row.key)).toEqual([
      'watchlist:one',
      CONTINUE_WATCHING_ROW_KEY,
      'catalog:addon-b:series:b',
    ])
  })

  it('builds expected page-specific candidates', () => {
    const rows = buildBrowseRowCandidates(
      'movies',
      [catalog('a', 'movie'), catalog('b', 'series')],
      [list('one')],
    )

    expect(rows.map((row) => row.key)).toEqual([
      'catalog:addon-a:movie:a',
      'watchlist:one',
    ])
  })

  it('filters watchlist items by page type for movies and series', () => {
    const items = [item('1', 'movie'), item('2', 'series')]

    expect(filterWatchlistItemsForPage('home', items)).toHaveLength(2)
    expect(filterWatchlistItemsForPage('movies', items).map((value) => value.media_type)).toEqual(['movie'])
    expect(filterWatchlistItemsForPage('series', items).map((value) => value.media_type)).toEqual(['series'])
  })
})

it('combines matching home catalogs only within an addon and persists per-row media choices', () => {
  const movie = { ...catalog('popular', 'movie'), catalog: { id: 'popular', type: 'movie', name: 'Popular' } };
  const series = { ...movie, catalog: { id: 'popular', type: 'series', name: 'Popular' } };
  const other = { ...series, addon_id: 'other' };
  const rows = buildBrowseRowCandidates('home', [movie, series, other], []);
  expect(rows).toHaveLength(3);
  expect(rows[1].catalogEntries).toEqual([movie, series]);
  const layout = normalizeBrowseLayoutPage({ order: [], hidden: [], catalogModes: { [rows[1].key]: 'series' } });
  expect(resolveVisibleBrowseRows(rows, layout)[1].catalogEntries).toEqual([series]);
  expect(buildBrowseRowCandidates('movies', [movie, series], [])[0].catalogEntries).toEqual([movie]);
});
