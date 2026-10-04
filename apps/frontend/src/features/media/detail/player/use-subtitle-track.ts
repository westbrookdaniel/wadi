import { useEffect, useState } from 'react'
import { buildSubtitleProxyUrl } from '../stream-playback'
import { parseSubtitleText, type SubtitleCue } from './subtitle-utils'

export function useSubtitleTrack(url?: string) {
  const [result, setResult] = useState<{ url?: string; cues: SubtitleCue[]; error: string | null }>({ url, cues: [], error: null })
  if (result.url !== url) setResult({ url, cues: [], error: null })
  useEffect(() => {
    if (!url) return
    let cancelled = false
    const controller = new AbortController()
    void buildSubtitleProxyUrl(url).then(proxy => fetch(proxy, { signal: controller.signal }))
      .then(async response => {
        if (!response.ok) throw new Error('Subtitle request failed')
        const cues = parseSubtitleText(await response.text())
        if (!cues.length) throw new Error('No subtitle cues')
        if (!cancelled) setResult({ url, cues, error: null })
      }).catch(() => {
        if (!cancelled) setResult({ url, cues: [], error: 'Could not load subtitles. Choose another track.' })
      })
    return () => { cancelled = true; controller.abort() }
  }, [url])
  // Never render the previous language while a new track is loading or off.
  return url && result.url === url ? result : { cues: [], error: null }
}
