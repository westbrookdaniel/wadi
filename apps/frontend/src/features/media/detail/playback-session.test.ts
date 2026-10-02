import { beforeEach, expect, it } from 'vitest'
import { useAppStore } from '@/store/app-store'
import { acknowledgePlaybackPosition, reconcilePlaybackPosition, readSubtitleChoice, saveSubtitleChoice, readPlaybackPosition, readPlaybackSession, savePlaybackPosition, savePlaybackSession } from './playback-session'
import { defaultSubtitleForAudio, languageName } from './player/subtitle-utils'

const target = { mediaType: 'series', mediaId: 'show', videoId: 'show:1:2' }
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); useAppStore.setState({ activeProfileId: 'profile-a' }) })
it('restores the exact stream and episode from the URL session key', () => {
  const stream = { url: 'https://example.com/movie.mkv', subtitles: [{ id: 'en', lang: 'eng', url: 'https://example.com/captions.srt' }] }
  const key = savePlaybackSession(stream, target)
  expect(readPlaybackSession(key, 'series', 'show')).toEqual({ stream, target })
  expect(readPlaybackSession(key, 'series', 'another-show')).toBeNull()
  useAppStore.setState({ activeProfileId: 'profile-b' })
  expect(readPlaybackSession(key, 'series', 'show')).toBeNull()
})
it('keeps progress separate for each episode and preserves seeking backwards', () => {
  savePlaybackPosition(target, 80)
  savePlaybackPosition(target, 12)
  expect(readPlaybackPosition(target)).toBe(12)
  expect(readPlaybackPosition({ ...target, videoId: 'show:1:3' })).toBeNull()
})
it('uses English subtitles for Japanese audio and no subtitles for English audio', () => {
  const tracks = [{ id: 'zh', language: 'zho' }, { id: 'en', language: 'eng' }]
  expect(defaultSubtitleForAudio('jpn', tracks)).toBe('en')
  expect(defaultSubtitleForAudio('en', tracks)).toBeNull()
  expect(defaultSubtitleForAudio('eng', tracks)).toBeNull()
  expect(defaultSubtitleForAudio('ja', [{ id: 'zh', language: 'zho' }])).toBeNull()
  expect(languageName('jpn')).toBe('Japanese')
  expect(languageName('eng')).toBe('English')
})

it('remembers an explicit subtitle choice, including off, for the show', () => {
  expect(readSubtitleChoice(target)).toBeUndefined()
  saveSubtitleChoice(target, { id: 'english-2', language: 'eng' })
  expect(readSubtitleChoice({ ...target, videoId: 'show:1:3' })).toEqual({ id: 'english-2', language: 'eng' })
  saveSubtitleChoice(target, { id: null, language: null })
  expect(readSubtitleChoice(target)).toEqual({ id: null, language: null })
})
it('ignores damaged or missing session data', () => {
  sessionStorage.setItem('wadi.playback.profile-a.broken', '{bad json')
  expect(readPlaybackSession('broken', 'series', 'show')).toBeNull()
  expect(readPlaybackSession('missing', 'series', 'show')).toBeNull()
})

it('reconciles A → B → A by freshness, including server and local rewinds', () => {
  const now = Date.now()
  savePlaybackPosition(target, 100, now - 10000)
  expect(reconcilePlaybackPosition(target, { position_seconds: 300, updated_at: new Date(now - 5000).toISOString() })).toBe(300)
  expect(reconcilePlaybackPosition(target, { position_seconds: 30, updated_at: new Date(now - 5000).toISOString() })).toBe(30)
  savePlaybackPosition(target, 12, now)
  expect(reconcilePlaybackPosition(target, { position_seconds: 300, updated_at: new Date(now - 5000).toISOString() })).toBe(12)
  expect(reconcilePlaybackPosition(target, { position_seconds: 0, updated_at: new Date(now).toISOString() })).toBe(0)
})
it('migrates numeric checkpoints conservatively and rejects corrupt or implausible freshness', () => {
  const key = 'wadi.playback.profile-a.position.series.show.show:1:2'
  const server = { position_seconds: 40, updated_at: new Date().toISOString() }
  localStorage.setItem(key, '300')
  expect(reconcilePlaybackPosition(target, server)).toBe(40)
  expect(reconcilePlaybackPosition(target, { position_seconds: 0, updated_at: null })).toBe(300)
  for (const value of ['-1', '{"position":10,"updatedAt":"today"}', 'null', '{broken']) {
    localStorage.setItem(key, value)
    expect(reconcilePlaybackPosition(target, server)).toBe(40)
  }
  savePlaybackPosition(target, 500, Date.now() + 86400000)
  expect(reconcilePlaybackPosition(target, server)).toBe(40)
  savePlaybackPosition(target, 20)
  savePlaybackPosition(target, NaN)
  expect(readPlaybackPosition(target)).toBe(20)
  useAppStore.setState({ activeProfileId: 'other-profile' })
  expect(readPlaybackPosition(target)).toBeNull()
})

it('an acknowledgement of an earlier write cannot outrank a pending local rewind', () => {
  const now = Date.now()
  const first = savePlaybackPosition(target, 300, now - 2000)!
  savePlaybackPosition(target, 20, now - 1000)
  const response = { position_seconds: 300, updated_at: new Date(now).toISOString() }
  acknowledgePlaybackPosition(target, first, response)
  expect(reconcilePlaybackPosition(target, response)).toBe(20)
  // The next device's later checkpoint still wins.
  expect(reconcilePlaybackPosition(target, { position_seconds: 50, updated_at: new Date(now + 100).toISOString() })).toBe(50)
})
it('orders same-millisecond actions and adopts the acknowledged server normalization', () => {
  const first = savePlaybackPosition(target, 80)!
  const second = savePlaybackPosition(target, 12)!
  expect(second).toBeGreaterThan(first)
  const response = { position_seconds: 0, updated_at: new Date(Date.now() + 10).toISOString() }
  acknowledgePlaybackPosition(target, second, response)
  expect(readPlaybackPosition(target)).toBe(0)
})
