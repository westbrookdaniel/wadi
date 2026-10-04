import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { desktopBridge } from '@/lib/desktop'

export function CopyStreamLink({ url }: { url?: string | null }) {
  return <CopyCurrentLink key={url ?? ''} url={url} />
}

function CopyCurrentLink({ url }: { url?: string | null }) {
  const [status, setStatus] = useState<'idle' | 'copying' | 'copied' | 'fallback'>('idle')
  const alive = useRef(true)
  const attempt = useRef(0)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  return <div className="relative grid gap-2 text-sm">
    <Button type="button" variant="secondary" disabled={!url || status === 'copying'} onClick={async () => {
      if (!url) return
      const request = ++attempt.current
      setStatus('copying')
      try {
        const desktop = desktopBridge()
        if (desktop) {
          if (!desktop.copyStreamLink) throw new Error('Desktop copy unavailable')
          await desktop.copyStreamLink(url)
        } else await navigator.clipboard.writeText(url)
        if (alive.current && request === attempt.current) setStatus('copied')
      } catch {
        if (alive.current && request === attempt.current) setStatus('fallback')
      }
    }}>Copy stream link</Button>
    {!url ? <p role="status">This stream has no copyable link.</p> : status === 'copied' ? <p role="status">Stream link copied.</p> : null}
    {status === 'fallback' ? <div className="absolute bottom-full right-0 z-30 mb-2 grid w-[min(320px,85vw)] gap-2 rounded-lg border bg-background p-3 text-foreground shadow-lg">
      <p role="alert">Could not copy automatically. Select the link and copy it manually.</p>
      <textarea aria-label="Stream link" readOnly value={url ?? ''} className="w-full rounded border p-2" onFocus={event => event.currentTarget.select()} />
      <Button variant="secondary" onClick={() => setStatus('idle')}>Close link</Button>
    </div> : null}
  </div>
}
