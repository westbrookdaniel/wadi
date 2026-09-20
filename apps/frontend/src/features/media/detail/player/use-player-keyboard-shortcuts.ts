import { isShortcutBlocked } from '@/lib/keyboard'
import { useEffect, useRef } from 'react'

import { canControlPlayback, type PlayerStatus } from './state'

type KeyboardState = {
  status: PlayerStatus
  currentTime: number
  duration: number
  playbackSpeed: number
  volume: number
}

type KeyboardHandlers = {
  onTogglePlay: () => void
  onSeek: (seconds: number) => void
  onToggleMute: () => void
  onVolumeChange: (volume: number) => void
  onChangeSpeed: (speed: number) => void
  onToggleFullscreen: () => void
}

export function usePlayerKeyboardShortcuts(state: KeyboardState, handlers: KeyboardHandlers) {
  const stateRef = useRef(state)
  const handlersRef = useRef(handlers)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isShortcutBlocked(event) || event.metaKey || event.ctrlKey || event.altKey) return
      if (event.repeat && !event.code.startsWith('Arrow')) return
      if (event.code === 'Space' && event.target instanceof Element && event.target.closest('button, a')) return

      const snapshot = stateRef.current
      if (!canControlPlayback(snapshot)) {
        return
      }
      const currentHandlers = handlersRef.current
      if (event.code === 'Space' || event.code === 'KeyK') {
        currentHandlers.onTogglePlay()
      } else if (event.code === 'ArrowLeft') {
        currentHandlers.onSeek(Math.max(snapshot.currentTime - 5, 0))
      } else if (event.code === 'ArrowRight') {
        currentHandlers.onSeek(Math.min(snapshot.currentTime + 5, snapshot.duration))
      } else if (event.code === 'KeyJ') {
        currentHandlers.onSeek(Math.max(snapshot.currentTime - 10, 0))
      } else if (event.code === 'KeyL') {
        currentHandlers.onSeek(Math.min(snapshot.currentTime + 10, snapshot.duration))
      } else if (event.code === 'ArrowUp') {
        currentHandlers.onVolumeChange(Math.min(snapshot.volume + 0.05, 1))
      } else if (event.code === 'ArrowDown') {
        currentHandlers.onVolumeChange(Math.max(snapshot.volume - 0.05, 0))
      } else if (event.code === 'KeyM') {
        currentHandlers.onToggleMute()
      } else if (event.code === 'KeyF') {
        currentHandlers.onToggleFullscreen()
      } else if (event.code === 'Comma') {
        currentHandlers.onChangeSpeed(Math.max(snapshot.playbackSpeed - 0.25, 0.25))
      } else if (event.code === 'Period') {
        currentHandlers.onChangeSpeed(Math.min(snapshot.playbackSpeed + 0.25, 3))
      } else {
        return
      }
      event.preventDefault()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
