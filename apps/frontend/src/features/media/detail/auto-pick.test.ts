import { describe, expect, it } from 'vitest'
import { defaultAutoPlayback } from '@/store/auto-playback'
import { nextReleasedEpisode, rankStreams } from './auto-pick'
import type { Episode } from './types'

const settings = { ...defaultAutoPlayback, enabled: true }
describe('automatic stream selection', () => {
  it('ranks a preferred eligible stream ahead of larger higher resolution options', () => {
    const ranked = rankStreams([{ url: 'https://test/4k', title: '2160p HEVC 20 GB English' }, { url: 'https://test/hd', title: '1080p H.264 2 GB English' }], settings)
    expect(ranked[0].stream.url).toBe('https://test/hd')
  })
  it('never recommends magnets, excluded words, camera copies, or streams beyond hard limits', () => {
    const ranked = rankStreams([{ url: 'magnet:?xt=urn:1', title: '1080p' }, { url: 'https://test/cam', title: '1080p HDCAM' }, { url: 'https://test/large', title: '2160p 20 GB' }, { url: 'https://test/bad', title: '1080p unwanted' }], { ...settings, maxResolution: 1080, excludedWords: 'unwanted' })
    expect(ranked.every(row => !row.eligible)).toBe(true)
  })
  it('preserves ties and respects unknown metadata and language aliases', () => {
    const streams = [{ url: 'https://test/a' }, { url: 'https://test/b', language: 'eng' }]
    expect(rankStreams(streams, settings)[0].stream).toBe(streams[0])
    expect(rankStreams(streams, { ...settings, language: 'en' })[0].stream).toBe(streams[1])
    expect(rankStreams(streams, { ...settings, allowUnknown: false }).every(row => !row.eligible)).toBe(true)
  })
})
describe('next episode eligibility', () => {
  const episode = (id: string, n: number, released?: string): Episode => ({ id, title: id, season: 1, episode: n, released })
  const now = Date.parse('2026-09-20T12:00:00Z')
  it('matches provider aliases and only advances to the immediate released episode', () => {
    const current = { ...episode('one', 1), videoIds: ['provider:one'] }
    const next = episode('two', 2, '2026-09-19')
    expect(nextReleasedEpisode([next, current], 'provider:one', now)).toBe(next)
    expect(nextReleasedEpisode([current, episode('two', 2), episode('three', 3, '2026-09-19')], 'one', now)).toBeNull()
  })
  it('rejects uncertain, conflicting and invalid releases and does not wrap at the finale', () => {
    for (const next of [episode('two', 2, '2026-09-20'), episode('two', 2, '2026-02-30'), { ...episode('two', 2, '2026-09-19'), releaseConflicting: true }]) expect(nextReleasedEpisode([episode('one', 1), next], 'one', now)).toBeNull()
    expect(nextReleasedEpisode([episode('one', 1)], 'one', now)).toBeNull()
  })
})
