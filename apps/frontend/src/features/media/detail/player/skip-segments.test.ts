import { expect, it } from 'vitest'
import { activeSegment, segmentParams, skipSegmentsQuery, type SkipSegment } from './skip-segments'
const target = { mediaType: 'series', mediaId: 'tt0903747', videoId: 'tt0903747:1:2' }
it('resolves episodes, specials and movies without guessing unknown addon IDs', () => {
  expect(segmentParams(target)).toBe('imdb_id=tt0903747&season=1&episode=2')
  expect(segmentParams({ ...target, episodeContext: { season: 0, episode: 3, title: 'Special' } })).toBe('imdb_id=tt0903747&season=0&episode=3')
  expect(segmentParams({ ...target, mediaType: 'movie' })).toBe('imdb_id=tt0903747&is_movie=true')
  for (const input of [{ ...target, mediaId: 'kitsu:123' }, { ...target, videoId: 'tt1234567:1:2' }, { ...target, videoId: null }, { ...target, videoId: 'tt0903747:1:0' }]) expect(segmentParams(input)).toBeNull()
  expect(skipSegmentsQuery({ ...target, videoId: null }).enabled).toBe(false)
  expect(skipSegmentsQuery(target).queryKey).not.toEqual(skipSegmentsQuery({ ...target, videoId: 'tt0903747:1:3' }).queryKey)
})
it('shows all segment types only within valid bounds and preserves post-credit scenes', () => {
  const segments: SkipSegment[] = [{ type: 'recap', start: 0, end: 20 }, { type: 'intro', start: 40, end: 80 }, { type: 'outro', start: 500, end: 550 }]
  expect(activeSegment(segments, 0, 600)?.type).toBe('recap')
  expect(activeSegment(segments, 20, 600)).toBeUndefined()
  expect(activeSegment(segments, 40, 600)?.type).toBe('intro')
  expect(activeSegment(segments, 500, 600)?.end).toBe(550)
  expect(activeSegment(segments, 550, 600)).toBeUndefined()
  expect(activeSegment(segments, 510, 520)).toBeUndefined()
  expect(activeSegment(segments, 40, 0)).toBeUndefined()
  expect(activeSegment(segments, NaN, 600)).toBeUndefined()
})
