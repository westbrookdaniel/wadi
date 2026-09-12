import { desktopBridge } from '@/lib/desktop'
import { useDeviceStore } from '@/store/device-store'
import { SettingsSelect } from '@/components/ui/settings-select'
import { Button } from '@/components/ui/button'
export function DeviceSettings() {
  const device = useDeviceStore()
  const desktop = desktopBridge()
  return <section className="settings-panel grid gap-5" aria-label="This device">
    <div><h2 className="text-base font-medium">This device</h2><p className="mt-1 text-sm text-muted-foreground">Saved on this device. Other devices keep their own preferences.</p></div>
    <div className="grid max-w-sm gap-2"><label htmlFor="appearance" className="text-sm font-medium">Appearance</label>
      <SettingsSelect id="appearance" value={device.theme} onValueChange={value => { if (value === 'light' || value === 'dark' || value === 'system') device.setTheme(value) }}>
        <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
      </SettingsSelect>
    </div>
    <label className="flex items-start justify-between gap-6"><span><span className="block text-sm font-medium">TV navigation</span><span className="mt-1 block text-sm text-muted-foreground">Arrow keys or controller to move, Enter / A to select, Escape / B to go back.</span></span><input className="mt-1 size-5 shrink-0 accent-primary" type="checkbox" aria-label="TV navigation" checked={device.tvMode} onChange={event => device.setTvMode(event.target.checked)} /></label>
    <Button variant="secondary" className="justify-self-start" onClick={() => { if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {}); else void document.exitFullscreen() }}>Toggle fullscreen</Button>
    <p className="text-sm text-muted-foreground">{desktop ? 'Desktop playback automatically remuxes compatible tracks and converts unsupported audio or video while you watch.' : 'Web playback connects directly to the provider. Use the desktop app for local codec conversion and sources that block browser access.'}</p>
  </section>
}
