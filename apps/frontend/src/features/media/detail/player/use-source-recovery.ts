import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlayableStream } from '../types'
import type { PlayerState } from './state'

export function useSourceRecovery({ episodeKey, source, state, candidates, enabled, attempts, timeoutSeconds, savedPosition, onSwitch, onFailure }: {
  episodeKey: string
  source: PlayableStream
  state: PlayerState
  candidates: PlayableStream[]
  enabled: boolean
  attempts: number
  timeoutSeconds: number
  savedPosition: number
  onSwitch: (stream: PlayableStream, position: number, playing: boolean) => void
  onFailure: (stream: PlayableStream) => void
}) {
  const session = useRef({ episodeKey, tried: new Set<string>(), count: 0, failures: new Set<string>(), position: savedPosition, playing: true })
  const sourcePhase = useRef({ url: source.url, awaitingLoad: false })
  const [notice, setNotice] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState(false)
  const snapshot = useRef({ source, state, candidates, enabled, attempts, onSwitch, onFailure, savedPosition })
  useEffect(() => { snapshot.current = { source, state, candidates, enabled, attempts, onSwitch, onFailure, savedPosition } })
  useEffect(() => {
    if (session.current.episodeKey !== episodeKey) {
      session.current = { episodeKey, tried: new Set(), count: 0, failures: new Set(), position: savedPosition, playing: true }
      setNotice(null)
      setExhausted(false)
    }
    if (sourcePhase.current.url !== source.url) sourcePhase.current = { url: source.url, awaitingLoad: true }
    if (state.status === 'loading' || state.sourceUrl === source.url) sourcePhase.current.awaitingLoad = false
    if (state.status === 'idle' && session.current.count === 0) session.current.position = savedPosition
    if (!sourcePhase.current.awaitingLoad && (!state.sourceUrl || state.sourceUrl === source.url) && state.status === 'ready' && state.duration > 0) {
      session.current.position = state.currentTime
      session.current.playing = state.playing
      setNotice(null)
      setExhausted(false)
    }
  }, [episodeKey, savedPosition, state.status, state.duration, state.currentTime, state.playing, state.sourceUrl, source.url])

  const tryAnother = useCallback((automatic = false) => {
    const current = snapshot.current
    const tracking = session.current
    const url = current.source.url ?? ''
    tracking.tried.add(url)
    if (automatic) {
      if (!current.enabled || tracking.count >= current.attempts || tracking.failures.has(url)) return false
      tracking.failures.add(url)
      current.onFailure(current.source)
    }
    const next = current.candidates.find(candidate => candidate.url && !tracking.tried.has(candidate.url))
    if (!next || automatic && tracking.count >= current.attempts) {
      setExhausted(true)
      setNotice('No more matching sources to try. Choose another source or adjust your preferences.')
      return false
    }
    tracking.tried.add(next.url!)
    if (automatic) tracking.count += 1
    setExhausted(false)
    setNotice(automatic ? `Trying another source… (${tracking.count}/${current.attempts})` : 'Switching source…')
    current.onSwitch(next, tracking.position, tracking.playing)
    return true
  }, [])

  useEffect(() => {
    if (enabled && state.status === 'error' && (!state.sourceUrl || state.sourceUrl === source.url) && !sourcePhase.current.awaitingLoad) {
      if (session.current.count >= attempts) {
        setExhausted(true)
        setNotice('Automatic retry limit reached. Choose another source to continue.')
      } else tryAnother(true)
    }
  }, [enabled, attempts, state.status, state.sourceUrl, source.url, tryAnother])
  useEffect(() => {
    if (!enabled || state.status !== 'loading' || state.duration > 0) return
    const timer = setTimeout(() => {
      if (session.current.count >= snapshot.current.attempts) {
        setExhausted(true)
        setNotice('Automatic retry limit reached. Choose another source to continue.')
      } else tryAnother(true)
    }, timeoutSeconds * 1000)
    return () => clearTimeout(timer)
  }, [enabled, state.status, state.duration, source.url, timeoutSeconds, tryAnother])
  return {
    notice, exhausted, tryAnother: () => tryAnother(false),
    getPosition: () => session.current.position,
    getPlaying: () => session.current.playing,
  }
}
