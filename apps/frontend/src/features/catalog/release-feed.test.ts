import { expect, it } from 'vitest'
import { defaultReleasePreferences, selectReleases, withReleaseSlot, type Release } from './release-feed'
const release = (id: string, released: string, overrides: Partial<Release['episode']> = {}): Release => ({ show: { media_id: id, title: id, poster: null }, episode: { id, title: id, season: 1, episode: 1, released, releasePrecision: 'date', releaseState: 'released', releaseConflicting: false, watched: false, position_seconds: 0, videoIds: [id], addonIds: ['provider'], ...overrides } })
it('filters conflicts, old releases, specials and distant upcoming episodes', () => {
  const rows = [release('old', '2026-08-01'), release('special', '2026-09-19', { season: 0 }), release('conflict', '2026-09-19', { releaseConflicting: true }), release('recent', '2026-09-19'), release('soon', '2026-09-22'), release('later', '2026-12-01')]
  expect(selectReleases(rows, defaultReleasePreferences, Date.parse('2026-09-20')).map(row => row.show.media_id)).toEqual(['recent', 'soon'])
})
it('bounds traffic and prevents cancelled queued requests from starting', async () => {
  const unlock: (() => void)[] = []
  const running = Array.from({ length: 4 }, () => withReleaseSlot(new AbortController().signal, () => new Promise<void>(resolve => unlock.push(resolve))))
  await Promise.resolve()
  const controller = new AbortController()
  let called = false
  const queued = withReleaseSlot(controller.signal, async () => { called = true })
  const rejected = expect(queued).rejects.toMatchObject({ name: 'AbortError' })
  controller.abort()
  await rejected
  expect(called).toBe(false)
  unlock.forEach(resolve => resolve())
  await Promise.all(running)
  await expect(withReleaseSlot(new AbortController().signal, async () => 'next')).resolves.toBe('next')
})
