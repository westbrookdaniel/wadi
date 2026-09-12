import { useEffect, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { desktopBridge, type DesktopUpdate } from '@/lib/desktop'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function DesktopUpdateControl() {
  const [state, setState] = useState<DesktopUpdate>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const bridge = desktopBridge()
    if (!bridge) return
    let alive = true, received = false
    const unsubscribe = bridge.onUpdate(next => { received = true; if (alive) setState(next) })
    void bridge.updateState().then(next => { if (alive && !received) setState(next) }).catch(() => {})
    return () => { alive = false; unsubscribe() }
  }, [])
  if (state.kind === 'idle' || state.kind === 'checking') return null
  const ready = state.kind === 'available'
  const title = ready ? 'Download update' : 'Retry update'
  const detail = ready ? `Version ${state.version}. Install it over your existing app.` : state.message
  const Icon = ready ? Download : RefreshCw
  async function act() {
    const bridge = desktopBridge()
    if (!bridge || busy) return
    setBusy(true)
    try { if (ready) await bridge.downloadUpdate(); else await bridge.checkUpdates() }
    catch { setState({ kind: 'error', message: 'Could not update Wadi. Please try again.' }) }
    finally { setBusy(false) }
  }
  return <Tooltip>
    <TooltipTrigger asChild><button type="button" aria-label={`${title}: ${detail}`} aria-disabled={busy} onClick={() => void act()} className={`absolute bottom-5 left-1/2 grid size-12 -translate-x-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring max-[800px]:bottom-20 max-[800px]:left-8 ${ready ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
      <Icon className="size-5" aria-hidden="true" />
    </button></TooltipTrigger>
    <TooltipContent side="top" align="start" sideOffset={12} className="grid max-w-64 gap-1 p-3"><strong className="text-sm font-medium">{title}</strong><span className="text-xs leading-relaxed opacity-80">{detail}</span></TooltipContent>
  </Tooltip>
}
