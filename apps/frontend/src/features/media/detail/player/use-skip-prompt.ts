import { useCallback, useEffect, useState } from 'react'
import type { SkipSegment } from './skip-segments'

/** One ten-second offer per visit; unrelated renders never extend it. */
export function useSkipPrompt(segment?: SkipSegment) {
  const key = segment ? `${segment.type}:${segment.start}:${segment.end}` : null
  const [visit, setVisit] = useState(key)
  const [dismissed, setDismissed] = useState(false)
  if (visit !== key) {
    setVisit(key)
    setDismissed(false)
  }
  const dismiss = useCallback(() => setDismissed(true), [])
  useEffect(() => {
    if (key === null) return
    const timer = window.setTimeout(dismiss, 10_000)
    return () => window.clearTimeout(timer)
  }, [key, dismiss])
  return { visible: key !== null && !dismissed, dismiss }
}
