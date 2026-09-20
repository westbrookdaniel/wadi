import { useCallback, useEffect, useRef } from 'react'

/** One prompt per episode, including after cancellation or a source change. */
export function useEpisodeAutoplay({ episodeKey, enabled, playing, currentTime, duration, leadSeconds, onPrompt }: {
  episodeKey: string
  enabled: boolean
  playing: boolean
  currentTime: number
  duration: number
  leadSeconds: number
  onPrompt: () => void
}) {
  const previousEpisode = useRef(episodeKey)
  const promptedEpisode = useRef<string | null>(null)
  const onEnded = useCallback(() => {
    if (!enabled || promptedEpisode.current === episodeKey) return
    promptedEpisode.current = episodeKey
    onPrompt()
  }, [enabled, episodeKey, onPrompt])
  useEffect(() => {
    // Player metadata from the previous source can survive for one render.
    if (previousEpisode.current !== episodeKey) {
      previousEpisode.current = episodeKey
      promptedEpisode.current = null
      return
    }
    if (leadSeconds > 0 && playing && Number.isFinite(duration) && duration > 0 && currentTime >= Math.max(duration / 2, duration - leadSeconds)) onEnded()
  }, [episodeKey, leadSeconds, playing, duration, currentTime, onEnded])
  return onEnded
}
