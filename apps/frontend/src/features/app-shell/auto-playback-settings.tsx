import { useQuery } from '@tanstack/react-query'
import { Sparkles, RotateCcw } from 'lucide-react'
import { addonsQuery } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { SettingsSelect } from '@/components/ui/settings-select'
import { useAutoPlayback } from '@/store/auto-playback'

export function AutoPlaybackSettings() {
  const { settings, update, reset } = useAutoPlayback()
  const addons = useQuery(addonsQuery)
  return <section className="grid gap-5 rounded-xl border border-border bg-card/60 p-5">
    <div className="flex items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-lg font-medium"><Sparkles className="size-4 text-primary" />Auto-pick streams</h2><p className="mt-1 text-sm text-muted-foreground">Your preferences, on this device. Changes save automatically.</p></div><Button variant="ghost" size="icon" aria-label="Reset auto-pick settings" onClick={reset}><RotateCcw className="size-4" /></Button></div>
    <Toggle label="Recommend a stream" description="Wait for providers, then put the best match first." checked={settings.enabled} onChange={enabled => update({ enabled })} />
    <Toggle label="Skip stream selection" description="Open the recommendation directly in Wadi. If nothing matches, show the stream list." checked={settings.skipSelection} disabled={!settings.enabled} onChange={skipSelection => update({ skipSelection })} />
    <fieldset disabled={!settings.enabled} className="grid gap-5 border-t border-border pt-5 disabled:opacity-50">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">Preferred resolution<SettingsSelect value={String(settings.preferredResolution)} onValueChange={value => update({ preferredResolution: Number(value) })}>{[480,720,1080,1440,2160].map(value => <option key={value} value={value}>{value === 2160 ? '4K / 2160p' : `${value}p`}</option>)}</SettingsSelect></label>
        <label className="grid gap-2 text-sm">Maximum resolution<SettingsSelect value={String(settings.maxResolution)} onValueChange={value => update({ maxResolution: Number(value) })}>{[480,720,1080,1440,2160].map(value => <option key={value} value={value}>{value === 2160 ? '4K / 2160p' : `${value}p`}</option>)}</SettingsSelect></label>
        <label className="grid gap-2 text-sm">Preferred codec<SettingsSelect value={settings.codec} onValueChange={value => { if (value === 'any' || value === 'H.264' || value === 'HEVC' || value === 'AV1') update({ codec: value }) }}><option value="any">No preference</option><option>H.264</option><option>HEVC</option><option>AV1</option></SettingsSelect></label>
        <label className="grid gap-2 text-sm">Preferred language<SettingsSelect value={settings.language} onValueChange={language => update({ language })}><option value="any">No preference</option>{[['en','English'],['es','Spanish'],['fr','French'],['de','German'],['ja','Japanese'],['hi','Hindi'],['it','Italian']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</SettingsSelect></label>
      </div>
      <Range label="Resolution preference strength" value={settings.qualityWeight} max={100} display={`${settings.qualityWeight}%`} onChange={qualityWeight => update({ qualityWeight })} />
      <Range label="Prefer smaller files" value={settings.sizeWeight} max={100} display={`${settings.sizeWeight}%`} onChange={sizeWeight => update({ sizeWeight })} />
      <Range label="Maximum file size" value={settings.maxSizeGB} max={100} display={settings.maxSizeGB ? `${settings.maxSizeGB} GB` : 'No limit'} onChange={maxSizeGB => update({ maxSizeGB })} />
      <label className="grid gap-2 text-sm">Preferred provider<SettingsSelect value={settings.preferredAddon} onValueChange={preferredAddon => update({ preferredAddon })}><option value="">No preference</option>{addons.data?.map(addon => <option key={addon.id} value={addon.id}>{addon.manifest.name}</option>)}</SettingsSelect></label>
      <div className="grid gap-4 rounded-lg bg-muted/40 p-4"><Toggle label="Avoid camera recordings" checked={settings.excludeCam} onChange={excludeCam => update({ excludeCam })} /><Toggle label="Allow HDR and Dolby Vision" checked={settings.allowHdr} onChange={allowHdr => update({ allowHdr })} /><Toggle label="Allow unknown resolution, size, or HDR" checked={settings.allowUnknown} onChange={allowUnknown => update({ allowUnknown })} /></div>
      <label className="grid gap-2 text-sm">Exclude words<input className="rounded-lg border border-border bg-background p-3" placeholder="e.g. sample, dubbed" maxLength={500} value={settings.excludedWords} onChange={event => update({ excludedWords: event.target.value })} /><span className="text-xs text-muted-foreground">Separate words with commas. Provider labels are hints, not a guarantee of playback support.</span></label>
    </fieldset>
    <div className="grid gap-4 border-t border-border pt-5"><h3 className="font-medium">Next episode</h3><Toggle label="Autoplay next episode" description="Continue after a cancellable countdown. Uses auto-pick when enabled; otherwise uses the first direct stream." checked={settings.autoplayNext} onChange={autoplayNext => update({ autoplayNext })} /><Range label="Countdown" value={settings.countdownSeconds} min={3} max={30} display={`${settings.countdownSeconds} seconds`} onChange={countdownSeconds => update({ countdownSeconds })} /><p className="text-xs text-muted-foreground">Automatic playback works in Wadi. External players and copy-link mode keep a manual launch step.</p></div>
  </section>
}
function Toggle({label,description,checked,disabled,onChange}:{label:string;description?:string;checked:boolean;disabled?:boolean;onChange:(value:boolean)=>void}) {
  return <label className={`flex items-center justify-between gap-5 text-sm ${disabled ? 'opacity-50' : ''}`}><span><span className="block font-medium">{label}</span>{description ? <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span> : null}</span><input type="checkbox" role="switch" className="h-6 w-10 shrink-0 cursor-pointer appearance-none rounded-full bg-muted-foreground/30 transition-colors before:block before:size-4 before:translate-x-1 before:rounded-full before:bg-white before:transition-transform checked:bg-primary checked:before:translate-x-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)} /></label>
}
function Range({label,value,min=0,max,display,onChange}:{label:string;value:number;min?:number;max:number;display:string;onChange:(value:number)=>void}) {
  return <label className="grid gap-3 text-sm"><span className="flex justify-between gap-3"><span>{label}</span><span className="text-muted-foreground tabular-nums">{display}</span></span><input type="range" className="w-full accent-primary" min={min} max={max} value={value} onChange={event=>onChange(Number(event.target.value))} /></label>
}
