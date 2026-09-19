import { describe, expect, it } from 'vitest'
import { parseStreamMetadata } from './stream-metadata'
describe('stream metadata', () => {
  it('reads release filenames and preserves provenance', () => {
    const parsed=parseStreamMetadata({behaviorHints:{filename:'Example.Show.S02E03.2160p.WEB-DL.DV.HDR.DDP.5.1.H.265-GROUP.mkv'},description:'English • 4.5 GiB'})
    expect(parsed.resolution).toEqual({value:2160,source:'filename'})
    expect(parsed.codec.value).toBe('HEVC');expect(parsed.sourceQuality.value).toBe('WEB-DL')
    expect(parsed.hdr.value).toBe('Dolby Vision');expect(parsed.audio.value).toBe('EAC3')
    expect(parsed.episode.value).toEqual({season:2,episode:3})
    expect(parsed.languages.value).toEqual(['en']);expect(parsed.sizeBytes.value).toBe(4.5*1024**3)
  })
  it('prefers structured fields over conflicting text', () => {
    const parsed=parseStreamMetadata({resolution:720,codec:'AV1',behaviorHints:{videoSize:123,bingeGroup:'provider-720'},title:'1080p H264 8 GB'})
    expect(parsed.resolution).toEqual({value:720,source:'structured'})
    expect(parsed.codec.value).toBe('AV1');expect(parsed.sizeBytes.value).toBe(123)
    expect(parsed.bingeGroup.value).toBe('provider-720')
  })
  it('does not invent unknown quality, language, HDR, or size', () => {
    for(const input of [null,{}, {title:'It follows the cam operator, 2020'}, {description:'unlimited 10800 seeders, 0 MB'}]) {
      const parsed=parseStreamMetadata(input)
      expect(parsed.resolution.value).toBeNull();expect(parsed.languages.value).toBeNull()
      expect(parsed.hdr.value).toBeNull();expect(parsed.sizeBytes.value).toBeNull()
    }
  })
  it('tolerates malformed fields and recognizes episode ranges and decimal size units', () => {
    const parsed=parseStreamMetadata({behaviorHints:null,resolution:[],title:'Show S01E01E02 1080p BluRay x264 DTS-HD 7.1 French 2 GB'})
    expect(parsed.resolution.value).toBe(1080);expect(parsed.episode.value).toEqual({season:1,episode:1,lastEpisode:2})
    expect(parsed.sizeBytes.value).toBe(2e9);expect(parsed.languages.value).toEqual(['fr'])
  })
  it('uses filename before title and handles x-style episode identifiers', () => {
    const parsed=parseStreamMetadata({filename:'Show.3x04.720p.HDTV.mkv',title:'4K suggested',description:'Audio: en'})
    expect(parsed.resolution.value).toBe(720);expect(parsed.episode.value).toEqual({season:3,episode:4})
  })
})
it('recognizes joined audio-channel tags and shorthand episode ranges', () => {
  const parsed = parseStreamMetadata({ filename: 'Show.S01E02-04.1080p.WEB-DL.DDP5.1.H264.mkv' })
  expect(parsed.audioChannels.value).toBe('5.1')
  expect(parsed.episode.value).toEqual({ season: 1, episode: 2, lastEpisode: 4 })
  expect(parseStreamMetadata({ filename: 'Show.S01E04-02.mkv' }).episode.value).toEqual({ season: 1, episode: 4 })
})
