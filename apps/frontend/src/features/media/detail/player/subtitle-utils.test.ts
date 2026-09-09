import { describe, expect, it } from 'vitest'

import { mergeSubtitleTracks, parseSubtitleText } from './subtitle-utils'

describe('parseSubtitleText', () => {
  it('parses BOM-prefixed WebVTT cues', () => {
    const text = '\uFEFFWEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello'
    expect(parseSubtitleText(text)).toEqual([
      { start: 0, end: 1, text: 'Hello' },
    ])
  })

  it('parses WebVTT cues with trailing settings on end timestamp', () => {
    const text = 'WEBVTT\n\n00:00:01.100 --> 00:00:02.200 line:90%\nHola'
    expect(parseSubtitleText(text)).toEqual([
      { start: 1.1, end: 2.2, text: 'Hola' },
    ])
  })

  it('parses SRT cues', () => {
    const text = '1\n00:00:05,000 --> 00:00:06,500\nBonjour'
    expect(parseSubtitleText(text)).toEqual([
      { start: 5, end: 6.5, text: 'Bonjour' },
    ])
  })
})

describe('mergeSubtitleTracks', () => {
  it('merges stream subtitles first and dedupes by id across sources', () => {
    const tracks = mergeSubtitleTracks(
      [{ id: 'eng', lang: 'eng', url: 'https://stream.example/eng.vtt' }],
      'stream-source',
      [
        { id: 'eng', lang: 'eng', url: 'https://addon.example/eng.vtt', source: 'addon-a' },
        { id: 'spa', lang: 'spa', url: 'https://addon.example/spa.vtt', source: 'addon-a' },
      ],
    )

    expect(tracks).toEqual([
      {
        id: 'eng',
        language: 'eng',
        source: 'stream-source',
        url: 'https://stream.example/eng.vtt',
      },
      {
        id: 'spa',
        language: 'spa',
        source: 'addon-a',
        url: 'https://addon.example/spa.vtt',
      },
    ])
  })
})
