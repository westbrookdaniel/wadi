import { useRef, useState } from 'react'
import type { PlayableStream } from './types'

export function useExternalLaunch() {
  const [failure, setFailure] = useState<{ stream: PlayableStream; message: string } | null>(null)
  const generation = useRef(0)
  const clearMessage = () => {
    ++generation.current
    setFailure(current => current ? { ...current, message: '' } : null)
  }
  const launch = (stream: PlayableStream, open: () => Promise<unknown>, keepDialog = false) => {
    const request = ++generation.current
    setFailure(keepDialog ? { stream, message: '' } : null)
    void open().then(() => {
      if (request === generation.current) setFailure(null)
    }).catch(error => {
      if (request === generation.current) setFailure({ stream, message: error instanceof Error ? error.message : 'Could not open player.' })
    })
  }
  const dismiss = () => { ++generation.current; setFailure(null) }
  return { failure, setFailure, clearMessage, launch, dismiss }
}
