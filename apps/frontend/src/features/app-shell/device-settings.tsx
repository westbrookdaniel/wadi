import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { apiRequest } from '@/api/client'
import { useDeviceStore } from '@/store/device-store'
import { Button } from '@/components/ui/button'
const capabilities = z.object({ conversion: z.boolean() })
export function DeviceSettings() {
  const device = useDeviceStore()
  const server = useQuery({ queryKey: ['server-capabilities'], queryFn: async () => capabilities.parse(await apiRequest('/api/server-capabilities')) })
  return <section className="settings-panel grid gap-5" aria-label="This device">
    <div><h2 className="text-base font-medium">This device</h2><p className="mt-1 text-sm text-muted-foreground">Saved in this browser. Other devices keep their own preferences.</p></div>
    <label className="flex items-start justify-between gap-6"><span><span className="block text-sm font-medium">TV navigation</span><span className="mt-1 block text-sm text-muted-foreground">Arrow keys or controller to move, Enter / A to select, Escape / B to go back.</span></span><input className="mt-1 size-5 shrink-0 accent-orange-400" type="checkbox" aria-label="TV navigation" checked={device.tvMode} onChange={event => device.setTvMode(event.target.checked)} /></label>
    <Button variant="secondary" className="justify-self-start" onClick={() => { if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {}); else void document.exitFullscreen() }}>Toggle fullscreen</Button>
    <label className="flex items-start justify-between gap-6"><span><span className="block text-sm font-medium">Prepare compatible video</span><span className="mt-1 block text-sm text-muted-foreground">Convert to H.264 / AAC on the server before playing. Preparation can take several minutes. Original playback is faster and uses fewer resources.</span></span><input className="mt-1 size-5 shrink-0 accent-orange-400" type="checkbox" aria-label="Prepare compatible video" checked={device.conversion} disabled={!server.data?.conversion && !device.conversion} onChange={event => device.setConversion(event.target.checked)} /></label>
    {!server.data?.conversion && <p className="text-xs text-muted-foreground">{server.isError ? 'Could not check conversion availability. Refresh to try again.' : 'Server conversion is off. Enable WADI_ENABLE_CONVERSION=1 on the host to use it.'}</p>}
  </section>
}
