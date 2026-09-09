import { describe, expect, it } from 'vitest'

import {
  readLastSeason, saveLastSeason, formatEpisodeReleaseDate,
  nextSeriesSearchState,
  preferredEpisodeIdFromSearch,
  seasonToSearchParam,
} from './series-url-state'

describe('series URL state helpers', () => {
  it('prefers episode over legacy videoId', () => {
    expect(
      preferredEpisodeIdFromSearch({
        episode: 'episode-id',
        videoId: 'legacy-video-id',
      }),
    ).toBe('episode-id')

    expect(preferredEpisodeIdFromSearch({ videoId: 'legacy-video-id' })).toBe(
      'legacy-video-id',
    )
  })

  it('serializes season to search params', () => {
    expect(seasonToSearchParam(2)).toBe('2')
    expect(seasonToSearchParam(0)).toBe('special')
    expect(seasonToSearchParam(null)).toBe('extras')
  })

  it('updates search state with season + episode only', () => {
    expect(
      nextSeriesSearchState(
        { from: '/series', season: '1', episode: 'old', videoId: 'old' },
        2,
        'new-id',
      ),
    ).toEqual({
      from: '/series',
      season: '2',
      episode: 'new-id',
    })

    expect(
      nextSeriesSearchState(
        { from: '/series', season: '2', episode: 'old', videoId: 'old' },
        0,
        null,
      ),
    ).toEqual({
      from: '/series',
      season: 'special',
      episode: undefined,
    })
  })
})

it('keeps remembered seasons isolated by profile and show, including specials', () => {
  saveLastSeason('a', 'show', 0)
  expect(readLastSeason('a', 'show')).toBe(0)
  expect(readLastSeason('b', 'show')).toBeUndefined()
  expect(readLastSeason('a', 'another-show')).toBeUndefined()
  saveLastSeason('a', 'show', null)
  expect(readLastSeason('a', 'show')).toBeNull()
})
it('omits missing and invalid release dates', () => {
  expect(formatEpisodeReleaseDate(undefined)).toBeNull()
  expect(formatEpisodeReleaseDate('invalid')).toBeNull()
})
