import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { desktopBridge } from '@/lib/desktop'
import { useDeviceStore } from '@/store/device-store'
import { SettingsSelect } from '@/components/ui/settings-select'
import { ChevronDown, FlaskConical } from 'lucide-react'
export function DeviceSettings() {
  const device = useDeviceStore()
  const desktop = desktopBridge()
  const [checking, setChecking] = useState(false)
  const [updateError, setUpdateError] = useState('')
  return <section className="settings-panel grid gap-5" aria-label="This device">
    <div><h2 className="text-base font-medium">This device</h2><p className="mt-1 text-sm text-muted-foreground">Saved on this device. Other devices keep their own preferences.</p></div>
    <div className="grid max-w-sm gap-2"><label htmlFor="appearance" className="text-sm font-medium">Appearance</label>
      <SettingsSelect id="appearance" value={device.theme} onValueChange={value => { if (value === 'light' || value === 'dark' || value === 'system') device.setTheme(value) }}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
      </SettingsSelect>
    </div>

    {desktop ? <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm font-medium">App updates</span><Button variant="outline" size="sm" disabled={checking} onClick={async () => { setChecking(true); setUpdateError(''); try { await desktop.checkUpdates() } catch { setUpdateError('Could not check for updates. Please try again.') } finally { setChecking(false) } }}>{checking ? 'Checking…' : 'Check for updates'}</Button>{updateError ? <p role="alert" className="w-full text-sm text-destructive">{updateError}</p> : null}</div> : null}
    <p className="text-sm text-muted-foreground">{desktop ? 'Desktop playback automatically remuxes compatible tracks and converts unsupported audio or video while you watch.' : 'Web playback connects directly to the provider. Use the desktop app for local codec conversion and sources that block browser access.'}</p>
  </section>
}

export function ExperimentalSettings() {
  const device = useDeviceStore()
  return <details className="settings-panel group !p-0 overflow-hidden">
    <summary className="flex cursor-pointer list-none items-center gap-3 p-5 text-sm font-medium transition-colors hover:bg-muted/50 [&::-webkit-details-marker]:hidden"><FlaskConical className="size-4 text-muted-foreground" />Experimental settings<ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
    <div className="grid gap-4 px-5 pb-5">
    <label className="flex items-start justify-between gap-6"><span><span className="block text-sm font-medium">TV navigation</span><span className="mt-1 block text-sm text-muted-foreground">Arrow keys or controller to move, Enter / A to select, Escape / B to go back.</span></span><input className="mt-1 size-5 shrink-0 accent-primary" type="checkbox" aria-label="TV navigation" checked={device.tvMode} onChange={event => device.setTvMode(event.target.checked)} /></label>
    </div>
  </details>
}
