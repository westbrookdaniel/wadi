import { useEffect, useRef } from 'react'

import type { PlayerStatus } from './state'

type KeyboardState = {
  status: PlayerStatus
  currentTime: number
  duration: number
  playbackSpeed: number
}

type KeyboardHandlers = {
  onTogglePlay: () => void
  onSeek: (seconds: number) => void
  onToggleMute: () => void
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
      const snapshot = stateRef.current
      if (snapshot.status !== 'ready') {
        return
      }
      const currentHandlers = handlersRef.current
      if (event.code === 'Space' || event.code === 'KeyK') {
        currentHandlers.onTogglePlay()
      } else if (event.code === 'ArrowLeft') {
        currentHandlers.onSeek(Math.max(snapshot.currentTime - 5, 0))
      } else if (event.code === 'ArrowRight') {
        currentHandlers.onSeek(Math.min(snapshot.currentTime + 5, snapshot.duration))
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
