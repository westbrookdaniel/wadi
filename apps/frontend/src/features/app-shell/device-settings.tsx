import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { desktopBridge } from '@/lib/desktop'
import { useDeviceStore } from '@/store/device-store'
import { SettingsSelect } from '@/components/ui/settings-select'
import { ChevronDown, FlaskConical } from 'lucide-react'
export function DeviceSettings() {
  const device = useDeviceStore()
  const desktop = desktopBridge()
  const [version, setVersion] = useState('')
  useEffect(() => { let active = true; void desktop?.appVersion().then(value => { if (active) setVersion(value) }).catch(() => {}); return () => { active = false } }, [desktop])
  const [checking, setChecking] = useState(false)
  const [updateError, setUpdateError] = useState('')
  return <section className="settings-panel grid gap-5" aria-label="This device">
    <label className="flex items-center justify-between gap-4 text-sm">Ask who is watching when Wadi opens<input type="checkbox" className="size-5" checked={device.askForProfile} onChange={event => device.setAskForProfile(event.target.checked)} /></label>
    <div className="grid max-w-sm gap-2"><label htmlFor="appearance" className="text-sm font-medium">Appearance</label>
      <SettingsSelect id="appearance" value={device.theme} onValueChange={value => { if (value === 'light' || value === 'dark' || value === 'system') device.setTheme(value) }}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
      </SettingsSelect>
    </div>

    {desktop ? <div className="grid gap-2">
      <label htmlFor="conversion" className="text-sm font-medium">Audio and video conversion</label>
      <SettingsSelect id="conversion" aria-describedby="conversion-description" className="max-w-sm" value={device.conversionEnabled ? 'on' : 'off'} onValueChange={value => { if (value === 'on' || value === 'off') device.setConversionEnabled(value === 'on') }}>
        <option value="on">On</option><option value="off">Off</option>
      </SettingsSelect>
      <p id="conversion-description" className="text-sm text-muted-foreground">Converts unsupported audio and video on your device while you watch. Turning this off reduces processing, but some streams may not play.</p>
    </div> : null}
    {desktop ? <div className="grid gap-2"><span className="text-sm font-medium">App updates</span><div className="flex flex-wrap items-center gap-3"><Button variant="outline" size="sm" disabled={checking} onClick={async () => { setChecking(true); setUpdateError(''); try { await desktop.checkUpdates() } catch { setUpdateError('Could not check for updates. Please try again.') } finally { setChecking(false) } }}>{checking ? 'Checking…' : 'Check for updates'}</Button>{version ? <span className="text-sm text-muted-foreground">Version {version}</span> : null}</div>{updateError ? <p role="alert" className="w-full text-sm text-destructive">{updateError}</p> : null}</div> : null}
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
