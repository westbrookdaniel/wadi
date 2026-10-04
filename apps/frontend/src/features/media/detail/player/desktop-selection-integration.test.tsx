import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MediaPlayerPage } from './media-player-page'
import { useAppStore } from '@/store/app-store'
import type { DesktopBridge } from '@/lib/desktop'

// Real page, device preferences and desktop session hook; only external API/IPC
// and jsdom's unavailable HLS/media decoder boundaries use synthetic fixtures.
const mocks = vi.hoisted(() => ({ request: vi.fn(), starts: [] as Array<{ audio: string | null }> }))
vi.mock('@/api/client', () => ({ apiRequest: mocks.request, ApiError: Error }))
vi.mock('../chromecast', () => ({ getChromecastTransport: () => ({ setOptions: async () => {}, getCastState: () => 'disconnected', on() {}, off() {}, sendMessage: async () => {} }) }))
vi.mock('hls.js', () => ({ default: class {
  static Events = { MANIFEST_PARSED: 'ready', ERROR: 'error' }
  listeners = new Map<string, () => void>()
  on(event: string, callback: () => void) { this.listeners.set(event, callback) }
  loadSource() {}
  attachMedia() { queueMicrotask(() => this.listeners.get('ready')?.()) }
  destroy() {}
} }))
vi.mock('mediabunny', () => ({ ALL_FORMATS: [], UrlSource: class {}, Input: class {}, CanvasSink: class {}, AudioBufferSink: class {} }))
const defaults = {
  subtitles_enabled: true, subtitle_language: null, subtitle_delay_seconds: 0, subtitle_size: 1,
  subtitle_position: 0, subtitle_text_color: '#FFFFFF', subtitle_background_color: '#000000',
  subtitle_background_opacity: 0, subtitle_outline_color: '#000000', subtitle_outline_width: 1.5,
  subtitle_outline_style: 'outline', subtitle_font_family: 'sans-serif', subtitle_offset_x: 0,
  subtitle_offset_y: 0, playback_speed: 1, preferred_audio_language: null, preferred_audio_track_id: null,
}
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); mocks.starts = []
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  useAppStore.setState({ activeProfileId: 'selector-profile' })
  const paused = new WeakMap<HTMLMediaElement, boolean>()
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function(this: HTMLMediaElement) { return paused.get(this) ?? true })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function(this: HTMLMediaElement) { paused.set(this, false); this.dispatchEvent(new Event('play')) })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function(this: HTMLMediaElement) { paused.set(this, true); this.dispatchEvent(new Event('pause')) })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  mocks.request.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/watch-data')) return { media_type: 'movie', media_id: 'selector-film', items: [] }
    if (url.includes('player-defaults')) return defaults
    if (url.includes('player-override')) return {}
    if (url.includes('introdb')) return { enabled: false }
    if (url.includes('subtitles')) return { responses: [] }
    if (url.includes('playback')) return { stream_action: 'internal', external_player_template: 'vlc://{url}' }
    return { items: [] }
  })
  window.wadiDesktop = { media: async (action, payload) => {
    if (action === 'resource') return (payload as { url: string }).url
    if (action !== 'start') return { error: null }
    const input = payload as { id: string; position: number; audio: string | null }
    mocks.starts.push({ audio: input.audio })
    return { id: input.id, url: 'http://127.0.0.1/session/index.m3u8', duration: 180, offset: input.position,
      mode: 'audio', hasVideo: true, hasAudio: true, selectedAudioTrackId: input.audio ?? '1',
      audioTracks: [{ id: '1', label: 'English audio', language: 'eng' }, { id: '2', label: 'Japanese audio', language: 'jpn' }, { id: '3', label: 'English commentary', language: 'eng' }] }
  } } as DesktopBridge
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, text: async () => `1\n00:00:00,000 --> 00:03:00,000\n${url.includes('french') ? 'FRENCH QA CAPTION' : url.includes('english-alt') ? 'ENGLISH ALT QA CAPTION' : 'ENGLISH QA CAPTION'}\n` })))
})
afterEach(() => { delete window.wadiDesktop; vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); useAppStore.setState({ activeProfileId: null }) })
function showPlayer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const view = render(<QueryClientProvider client={client}><MediaPlayerPage media={{ id: 'selector-film', type: 'movie', name: 'Selector film', raw: {} }} target={{ mediaType: 'movie', mediaId: 'selector-film', videoId: null }} stream={{ url: 'https://example.invalid/film.mkv', subtitles: [{ id: 'en', lang: 'eng', url: 'https://example.invalid/english.srt' }, { id: 'fr', lang: 'fra', url: 'https://example.invalid/french.srt' }, { id: 'en-alt', lang: 'eng', url: 'https://example.invalid/english-alt.srt' }] }} onBack={() => {}} /></QueryClientProvider>)
  return { refreshSubtitleOptions() { client.setQueriesData({ queryKey: ['subtitles'] }, [{ id: 'addon-fr', lang: 'fra', url: 'https://example.invalid/french-addon.srt', addon_id: 'synthetic-addon' }]) }, close() { view.unmount(); client.clear() } }
}
function pointerClick(element: Element) { fireEvent.pointerDown(element); fireEvent.pointerUp(element); fireEvent.click(element) }
function subtitleChoice(language: string, index = 0) { return Array.from(screen.getByRole('group', { name: 'Subtitle tracks' }).querySelectorAll('button')).filter(button => button.textContent?.startsWith(language))[index] }
it('desktop real preferences and session hook permit repeated UI audio choices and return to default', async () => {
  const view = showPlayer()
  try {
    await waitFor(() => expect(mocks.starts).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled())
    for (const [label, audio] of [['Japanese audio', '2'], ['English commentary', '3'], ['English audio', '1'], ['English commentary', '3'], ['Japanese audio', '2'], ['Default audio', null]] as const) {
      pointerClick(screen.getByRole('button', { name: 'Audio track' }))
      pointerClick(screen.getByText(label))
      await waitFor(() => expect(mocks.starts.at(-1)?.audio).toBe(audio))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Audio track' }).textContent).toContain(audio === '2' ? 'Japanese' : 'English'))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled())
    }
  } finally { view.close() }
})
it('desktop real preferences permit French/English/off/on subtitle UI choices without locking', async () => {
  const view = showPlayer()
  try {
    await waitFor(() => expect(mocks.starts).toHaveLength(1))
    pointerClick(screen.getByRole('button', { name: 'Subtitles' }))
    for (const [language, index, caption] of [['French', 0, 'FRENCH QA CAPTION'], ['English', 0, 'ENGLISH ALT QA CAPTION'], ['English', 1, 'ENGLISH QA CAPTION'], ['English', 0, 'ENGLISH ALT QA CAPTION'], ['French', 0, 'FRENCH QA CAPTION']] as const) {
      await act(async () => pointerClick(subtitleChoice(language, index)))
      await waitFor(() => expect(screen.getByText(caption)).toBeInTheDocument())
      act(() => view.refreshSubtitleOptions())
      await waitFor(() => expect(screen.getByText(caption)).toBeInTheDocument())
    }
    await act(async () => pointerClick(screen.getByText(/No subtitles/)))
    await waitFor(() => expect(screen.queryByText('FRENCH QA CAPTION')).not.toBeInTheDocument())
    await act(async () => pointerClick(subtitleChoice('English', 0)))
    await waitFor(() => expect(screen.getByText('ENGLISH ALT QA CAPTION')).toBeInTheDocument())
  } finally { view.close() }
})
