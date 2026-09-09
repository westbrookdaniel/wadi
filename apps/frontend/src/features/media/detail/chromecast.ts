/// <reference types="chromecast-caf-sender" />
import { z } from 'zod'

export const WADI_CAST_NAMESPACE = 'urn:x-cast:com.wadi'
const DEFAULT_RECEIVER = 'CC1AD845'
type Listener = (...args: unknown[]) => void
const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('command'), commandName: z.literal('load'), commandArgs: z.object({ stream: z.object({ url: z.url(), subtitles: z.array(z.object({ id: z.string(), lang: z.string(), url: z.url() })).default([]) }), autoplay: z.boolean(), time: z.number() }) }),
  z.object({ type: z.literal('setProp'), propName: z.string(), propValue: z.unknown() }),
  z.object({ type: z.literal('observeProp'), propName: z.string() }),
])

export class ChromecastTransport {
  private listeners = new Map<string, Set<Listener>>()
  private initialized: Promise<void> | null = null
  private customReceiver = false
  private subtitleIds = new Map<string, number>()
  private remote: cast.framework.RemotePlayer | null = null
  private controller: cast.framework.RemotePlayerController | null = null
  private chunks = new Map<string, { parts: Map<number, string>; length: number; created: number }>()

  on(event: string, listener: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>()
    set.add(listener); this.listeners.set(event, set)
  }
  off(event: string, listener: Listener) { this.listeners.get(event)?.delete(listener) }
  private emit(event: string, ...args: unknown[]) { this.listeners.get(event)?.forEach(listener => listener(...args)) }
  private emitState = () => {
    if (!this.remote) return
    const state = { paused: this.remote.isPaused, currentTime: this.remote.currentTime, duration: this.remote.duration, volume: this.remote.volumeLevel, muted: this.remote.isMuted }
    for (const [key, value] of Object.entries(state)) this.emit('message', { event: 'propChanged', args: [key, value] })
  }
  private onMessage = (_namespace: string, payload: string) => {
    try {
      const value: unknown = JSON.parse(payload)
      const parsed = z.object({ id: z.string().max(100), chunk: z.string().max(20000), index: z.number().int().nonnegative(), length: z.number().int().min(1).max(100) }).parse(value)
      if (parsed.index >= parsed.length) return
      for (const [id, item] of this.chunks) if (Date.now() - item.created > 10000) this.chunks.delete(id)
      if (this.chunks.size >= 20) this.chunks.clear()
      const pending = this.chunks.get(parsed.id) ?? { parts: new Map<number, string>(), length: parsed.length, created: Date.now() }
      if (pending.length !== parsed.length) return
      pending.parts.set(parsed.index, parsed.chunk); this.chunks.set(parsed.id, pending)
      if (pending.parts.size === pending.length) {
        this.chunks.delete(parsed.id)
        const message: unknown = JSON.parse(Array.from({ length: pending.length }, (_, i) => pending.parts.get(i)).join(''))
        this.emit('message', message)
      }
    } catch (error) { this.emit('message_error', error) }
  }
  private ready() {
    if (this.initialized) return this.initialized
    this.initialized = new Promise<void>((resolve, reject) => {
      if (window.cast?.framework?.CastContext) return resolve()
      const timeout = window.setTimeout(() => reject(new Error('Google Cast is unavailable in this browser')), 10000)
      window.__onGCastApiAvailable = available => {
        window.clearTimeout(timeout)
        if (available && window.cast?.framework) resolve()
        else reject(new Error('Google Cast is unavailable in this browser'))
      }
    }).then(() => {
      const context = cast.framework.CastContext.getInstance()
      context.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, event => this.emit('cast_state_changed', event))
      context.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, event => {
        this.emit('session_state_changed', event)
        if (this.customReceiver && [cast.framework.SessionState.SESSION_STARTED, cast.framework.SessionState.SESSION_RESUMED].includes(event.sessionState)) event.session.addMessageListener(WADI_CAST_NAMESPACE, this.onMessage)
        if (this.customReceiver && event.sessionState === cast.framework.SessionState.SESSION_ENDED) event.session.removeMessageListener(WADI_CAST_NAMESPACE, this.onMessage)
      })
      this.remote = new cast.framework.RemotePlayer()
      this.controller = new cast.framework.RemotePlayerController(this.remote)
      this.controller.addEventListener(cast.framework.RemotePlayerEventType.ANY_CHANGE, this.emitState)
    }).catch(error => { this.initialized = null; throw error })
    return this.initialized
  }
  async setOptions(receiverApplicationId = DEFAULT_RECEIVER) {
    await this.ready()
    this.customReceiver = receiverApplicationId !== DEFAULT_RECEIVER
    cast.framework.CastContext.getInstance().setOptions({ receiverApplicationId, autoJoinPolicy: chrome.cast.AutoJoinPolicy.PAGE_SCOPED, resumeSavedSession: true })
  }
  getCastState() { return window.cast?.framework?.CastContext?.getInstance().getCastState() ?? null }
  getCastDevice() { return window.cast?.framework?.CastContext?.getInstance().getCurrentSession()?.getCastDevice() ?? null }
  async requestSession() { await this.ready(); return cast.framework.CastContext.getInstance().requestSession() }
  endCurrentSession(stopCasting = true) { window.cast?.framework?.CastContext?.getInstance().endCurrentSession(stopCasting) }
  async sendMessage(input: unknown) {
    await this.ready()
    const session = cast.framework.CastContext.getInstance().getCurrentSession()
    if (!session) throw new Error('Cast session not started')
    if (this.customReceiver) {
      const serialized = JSON.stringify(input), length = Math.ceil(serialized.length / 20000), id = crypto.randomUUID()
      for (let index = 0; index < length; index++) await session.sendMessage(WADI_CAST_NAMESPACE, { id, index, length, chunk: serialized.slice(index * 20000, (index + 1) * 20000) })
      return
    }
    const message = commandSchema.parse(input)
    if (message.type === 'command') {
      const { stream, time, autoplay } = message.commandArgs
      const url = new URL(stream.url)
      if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('This stream uses a loopback address. Use a URL your TV can reach.')
      const media = new chrome.cast.media.MediaInfo(stream.url, /\.m3u8(?:\?|$)/i.test(stream.url) ? 'application/x-mpegURL' : /\.webm(?:\?|$)/i.test(stream.url) ? 'video/webm' : 'video/mp4')
      this.subtitleIds.clear()
      media.tracks = stream.subtitles.map((subtitle, index) => {
        this.subtitleIds.set(subtitle.id, index + 1)
        const track = new chrome.cast.media.Track(index + 1, chrome.cast.media.TrackType.TEXT)
        track.trackContentId = subtitle.url; track.trackContentType = 'text/vtt'; track.subtype = chrome.cast.media.TextTrackType.SUBTITLES; track.language = subtitle.lang; track.name = subtitle.lang
        return track
      })
      const request = new chrome.cast.media.LoadRequest(media); request.currentTime = time; request.autoplay = autoplay
      const error = await session.loadMedia(request)
      if (error) throw new Error(`Cast could not load this stream: ${error}`)
    } else if (message.type === 'observeProp') this.emitState()
    else if (this.remote && this.controller) {
      const value = message.propValue
      switch (message.propName) {
        case 'paused': if (typeof value === 'boolean' && value !== this.remote.isPaused) this.controller.playOrPause(); break
        case 'time': if (typeof value === 'number') { this.remote.currentTime = value; this.controller.seek() } break
        case 'volume': if (typeof value === 'number') { this.remote.volumeLevel = Math.min(1, Math.max(0, value)); this.controller.setVolumeLevel() } break
        case 'selectedSubtitlesTrackId': {
          const media = session.getMediaSession()
          if (media) {
            const id = typeof value === 'string' ? this.subtitleIds.get(value) : undefined
            const request = new chrome.cast.media.EditTracksInfoRequest(id === undefined ? [] : [id])
            await new Promise<void>((resolve, reject) => media.editTracksInfo(request, resolve, reject))
          }
          break
        }
        case 'muted': if (typeof value === 'boolean' && value !== this.remote.isMuted) this.controller.muteOrUnmute(); break
      }
    }
  }
}
let transport: ChromecastTransport | undefined
export function getChromecastTransport() { return transport ??= new ChromecastTransport() }
