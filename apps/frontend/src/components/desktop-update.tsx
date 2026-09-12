import { useEffect, useState } from 'react'
import { Download, RotateCw, RefreshCw } from 'lucide-react'
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
  const ready = state.kind === 'ready'
  const downloading = state.kind === 'downloading'
  const title = ready ? 'Restart and update' : downloading ? 'Downloading update' : 'Retry update'
  const detail = ready ? `Version ${state.version}` : downloading ? `${Math.round(state.percent)}%` : state.message
  const Icon = ready ? RotateCw : downloading ? Download : RefreshCw
  async function act() {
    const bridge = desktopBridge()
    if (!bridge || downloading || busy) return
    setBusy(true)
    try { if (ready) await bridge.installUpdate(); else await bridge.checkUpdates() }
    catch { setState({ kind: 'error', message: 'Could not update Wadi. Please try again.' }) }
    finally { setBusy(false) }
  }
  return <Tooltip>
    <TooltipTrigger asChild><button type="button" aria-label={`${title}: ${detail}`} aria-disabled={busy || downloading} onClick={() => void act()} className={`absolute bottom-5 left-1/2 grid size-12 -translate-x-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring max-[800px]:bottom-20 max-[800px]:left-8 ${ready ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>
      {downloading ? <svg className="absolute inset-0 size-12 -rotate-90" viewBox="0 0 48 48" role="progressbar" aria-label="Update download" aria-valuenow={Math.round(state.percent)} aria-valuemin={0} aria-valuemax={100}><circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2" /><circle cx="24" cy="24" r="21" fill="none" stroke="var(--primary)" strokeWidth="2" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - state.percent} strokeLinecap="round" /></svg> : null}
      <Icon className="size-5" aria-hidden="true" />
    </button></TooltipTrigger>
    <TooltipContent side="top" align="start" sideOffset={12} className="grid max-w-64 gap-1 p-3"><strong className="text-sm font-medium">{title}</strong><span className="text-xs leading-relaxed opacity-80">{detail}</span></TooltipContent>
  </Tooltip>
}
