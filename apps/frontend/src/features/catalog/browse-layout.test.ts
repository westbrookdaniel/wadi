import type { CatalogEntry, UserList } from '@/api/types'
import { describe, expect, it } from 'vitest'

import {
  CONTINUE_WATCHING_ROW_KEY,
  buildBrowseRowCandidates,
  normalizeBrowseLayoutPage,
  normalizeBrowseLayout,
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

describe('browse-layout helpers', () => {
  it('applies order, hidden, and appends new rows at the end', () => {
    const candidates = buildBrowseRowCandidates(
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
      'new_episodes',
      'catalog:addon-b:series:b',
    ])
  })

  it('retains Home preferences from older saved layouts', () => {
    const legacy = { pages: { home: { order: ['saved'], hidden: [] }, movies: { order: ['old'], hidden: [] }, series: { order: [], hidden: [] } } }
    expect(normalizeBrowseLayout(legacy)).toEqual({ pages: { home: { order: ['saved'], hidden: [] } } })
  })

})

it('combines matching home catalogs only within an addon and persists per-row media choices', () => {
  const movie = { ...catalog('popular', 'movie'), catalog: { id: 'popular', type: 'movie', name: 'Popular' } };
  const series = { ...movie, catalog: { id: 'popular', type: 'series', name: 'Popular' } };
  const other = { ...series, addon_id: 'other' };
  const rows = buildBrowseRowCandidates([movie, series, other], []);
  expect(rows).toHaveLength(4);
  expect(rows[2].catalogEntries).toEqual([movie, series]);
  const layout = normalizeBrowseLayoutPage({ order: [], hidden: [], catalogModes: { [rows[2].key]: 'series' } });
  expect(resolveVisibleBrowseRows(rows, layout)[2].catalogEntries).toEqual([series]);
});
