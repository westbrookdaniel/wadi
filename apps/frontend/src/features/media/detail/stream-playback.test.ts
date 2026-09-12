import { describe, expect, it } from 'vitest'

import {
  DEFAULT_EXTERNAL_PLAYER_TEMPLATE,
  buildExternalPlayerUrl,
  getStreamUrl,
  normalizePlaybackPreferences,
} from './stream-playback'

describe('stream playback helpers', () => {
  it('prefers the direct stream URL and falls back to the external URL', () => {
    expect(
      getStreamUrl({
        url: ' https://cdn.example/video.m3u8 ',
        externalUrl: 'https://example.com/details',
      }),
    ).toBe('https://cdn.example/video.m3u8')
    expect(getStreamUrl({ externalUrl: 'https://example.com/video' })).toBe(
      'https://example.com/video',
    )
    expect(getStreamUrl({ url: ' ', externalUrl: ' ' })).toBeNull()
    expect(getStreamUrl({ infoHash: ' ABC123 ' })).toBe(
      'magnet:?xt=urn:btih:ABC123',
    )
  })

  it('encodes the complete stream URL for custom player schemes', () => {
    const streamUrl = 'https://cdn.example/video.mp4?token=a=b&part=1'
    expect(buildExternalPlayerUrl(streamUrl)).toBe(
      `vlc://${encodeURIComponent(streamUrl)}`,
    )
  })

  it('rejects templates without a URL placeholder', () => {
    expect(buildExternalPlayerUrl('https://example.com/video', 'vlc://')).toBeNull()
  })

  it('normalizes missing or unsupported preferences to the built-in player default', () => {
    expect(normalizePlaybackPreferences()).toEqual({
      stream_action: 'internal',
      external_player_template: DEFAULT_EXTERNAL_PLAYER_TEMPLATE,
      external_player_preset: 'vlc',
    })
    expect(
      normalizePlaybackPreferences({
        stream_action: 'unsupported' as never,
        external_player_template: '',
      }),
    ).toEqual({ stream_action: 'internal', external_player_template: '', external_player_preset: 'vlc' })
  })
})
