import { beforeEach, expect, it } from 'vitest'
import { useAppStore } from '@/store/app-store'
import { readSubtitleChoice, saveSubtitleChoice, readPlaybackPosition, readPlaybackSession, savePlaybackPosition, savePlaybackSession } from './playback-session'
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
