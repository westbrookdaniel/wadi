import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" className="rounded-full text-white hover:bg-white/14 focus-visible:ring-white/30" aria-label="Copy stream link" disabled={!url || status === 'copying'} onClick={async () => {
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
          }}>{status === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}</Button>
        </TooltipTrigger>
        <TooltipContent className="dark">Copy stream link</TooltipContent>
      </Tooltip>
    </TooltipProvider>
    {!url ? <p role="status" className="absolute bottom-full right-0 mb-10 w-max max-w-[85vw] rounded-lg bg-black/88 px-3 py-2 text-white">This stream has no copyable link.</p> : status === 'copied' ? <p role="status" className="absolute bottom-full right-0 mb-10 w-max max-w-[85vw] rounded-lg bg-black/88 px-3 py-2 text-white">Stream link copied.</p> : null}
    {status === 'fallback' ? <div className="absolute bottom-full right-0 z-30 mb-2 grid w-[min(320px,85vw)] gap-2 rounded-lg border bg-background p-3 text-foreground shadow-lg">
      <p role="alert">Could not copy automatically. Select the link and copy it manually.</p>
      <textarea aria-label="Stream link" readOnly value={url ?? ''} className="w-full rounded border p-2" onFocus={event => event.currentTarget.select()} />
      <Button variant="secondary" onClick={() => setStatus('idle')}>Close link</Button>
    </div> : null}
  </div>
}
