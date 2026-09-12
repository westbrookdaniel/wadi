import { useEffect, useState } from 'react'
import { Maximize, Minimize } from 'lucide-react'
import { desktopBridge } from '@/lib/desktop'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function WebFullscreen() {
  const [fullscreen, setFullscreen] = useState(false)
  const [error, setError] = useState('')
  const desktop = Boolean(desktopBridge())
  const toggle = async () => {
    try { setError(''); if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() }
    catch { setError('Fullscreen is unavailable in this browser.') }
  }
  useEffect(() => {
    if (desktop) return
    const changed = () => setFullscreen(Boolean(document.fullscreenElement))
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.key.toLowerCase() !== 'f') return
      if (event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')) return
      event.preventDefault(); void toggle()
    }
    changed()
    document.addEventListener('fullscreenchange', changed)
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('fullscreenchange', changed); document.removeEventListener('keydown', keydown) }
  }, [desktop])
  if (desktop) return null
  const Icon = fullscreen ? Minimize : Maximize
  return <div className="absolute bottom-20 left-1/2 -translate-x-1/2 max-[800px]:hidden"><Tooltip><TooltipTrigger asChild><button type="button" aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'} aria-keyshortcuts="f" onClick={() => void toggle()} className="grid size-12 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><Icon className="size-5" /></button></TooltipTrigger><TooltipContent side="top" align="start" sideOffset={12}>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'} <kbd>F</kbd></TooltipContent></Tooltip>{error && <p role="status" className="absolute bottom-full left-0 w-52 rounded-lg bg-popover p-3 text-xs text-popover-foreground">{error}</p>}</div>
}
