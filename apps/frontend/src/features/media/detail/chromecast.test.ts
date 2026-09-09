import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChromecastTransport } from './chromecast'

function sdk() {
  const loadMedia = vi.fn().mockResolvedValue(undefined)
  const seek = vi.fn(), playOrPause = vi.fn(), setVolumeLevel = vi.fn()
  const context = { addEventListener: vi.fn(), setOptions: vi.fn(), getCurrentSession: () => ({ loadMedia }), requestSession: vi.fn().mockResolvedValue(undefined) }
  class RemotePlayer { isPaused = false; currentTime = 0; volumeLevel = 1; isMuted = false }
  class RemotePlayerController { addEventListener = vi.fn(); seek = seek; playOrPause = playOrPause; setVolumeLevel = setVolumeLevel }
  class MediaInfo { contentId: string; contentType: string; constructor(id: string, type: string) { this.contentId = id; this.contentType = type } }
  class LoadRequest { media: MediaInfo; constructor(media: MediaInfo) { this.media = media } }
  class Track { trackId: number; constructor(id: number) { this.trackId = id } }
  vi.stubGlobal('cast', { framework: { CastContext: { getInstance: () => context }, CastContextEventType: { CAST_STATE_CHANGED: 'cast', SESSION_STATE_CHANGED: 'session' }, RemotePlayerEventType: { ANY_CHANGE: 'change' }, RemotePlayer, RemotePlayerController } })
  vi.stubGlobal('chrome', { cast: { AutoJoinPolicy: { PAGE_SCOPED: 'page' }, media: { MediaInfo, LoadRequest, Track, TrackType: { TEXT: 'text' }, TextTrackType: { SUBTITLES: 'subtitles' } } } })
  return { loadMedia, context, seek, playOrPause, setVolumeLevel }
}
afterEach(() => vi.unstubAllGlobals())
const load = (url = 'https://media.example/film.mp4') => ({ type: 'command', commandName: 'load', commandArgs: { stream: { url, subtitles: [{ id: 'english', lang: 'en', url: 'https://media.example/en.vtt' }] }, autoplay: true, time: 45 } })
describe('Google Cast sender', () => {
  it('uses the default receiver and carries stream, resume position and captions to the TV', async () => {
    const mock = sdk(), transport = new ChromecastTransport()
    await transport.setOptions(); await transport.sendMessage(load())
    expect(mock.context.setOptions).toHaveBeenCalledWith(expect.objectContaining({ receiverApplicationId: 'CC1AD845' }))
    expect(mock.loadMedia).toHaveBeenCalledWith(expect.objectContaining({ currentTime: 45, autoplay: true, media: expect.objectContaining({ contentId: 'https://media.example/film.mp4', tracks: [expect.objectContaining({ trackContentId: 'https://media.example/en.vtt' })] }) }))
    await transport.sendMessage({ type: 'setProp', propName: 'time', propValue: 80 }); expect(mock.seek).toHaveBeenCalledOnce()
    await transport.sendMessage({ type: 'setProp', propName: 'paused', propValue: true }); expect(mock.playOrPause).toHaveBeenCalledOnce()
  })
  it('rejects loopback media URLs and receiver load errors', async () => {
    const mock = sdk(), transport = new ChromecastTransport(); await transport.setOptions()
    await expect(transport.sendMessage(load('http://127.0.0.1/film.mp4'))).rejects.toThrow('TV can reach')
    expect(mock.loadMedia).not.toHaveBeenCalled()
    mock.loadMedia.mockResolvedValue('LOAD_MEDIA_FAILED')
    await expect(transport.sendMessage(load())).rejects.toThrow('LOAD_MEDIA_FAILED')
  })
})
