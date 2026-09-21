import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { addonsQuery } from '@/api/queries'
import { Button } from '@/components/ui/button'
import { SettingsSelect } from '@/components/ui/settings-select'
import { useAutoPlayback, type AutoPlaybackSettings as PlaybackSettings } from '@/store/auto-playback'

export function AutoPlaybackSettings() {
  const savedSettings = useAutoPlayback(state => state.settings)
  const saveSettings = useAutoPlayback(state => state.update)
  const [draft, setDraft] = useState<Partial<PlaybackSettings>>({})
  const settings = { ...savedSettings, ...draft }
  const update = (patch: Partial<PlaybackSettings>) => setDraft(current => ({ ...current, ...patch }))
  const needsIndicator = settings.enabled && settings.cachedMode !== 'any' && !settings.cachedIndicator.replace(/[\uFE0E\uFE0F]/g, '').trim()
  const isDirty = JSON.stringify(settings) !== JSON.stringify(savedSettings)
  const addons = useQuery(addonsQuery)
  return <section className="grid gap-5 rounded-xl border border-border bg-card/60 p-5">
    <div><h2 className="text-lg font-medium">Auto-pick streams</h2><p className="mt-1 text-sm text-muted-foreground">Choose how streams are selected on this device.</p></div>
    <Checkbox label="Recommend a stream" description="Wait for providers, then put the best match first." checked={settings.enabled} onChange={enabled => update({ enabled })} />
    <Checkbox label="Skip stream selection" description="Open the recommendation directly in Wadi. If nothing matches, show the stream list." checked={settings.skipSelection} disabled={!settings.enabled} onChange={skipSelection => update({ skipSelection })} />
    <fieldset disabled={!settings.enabled} className="grid gap-5 border-t border-border pt-5 disabled:opacity-50">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">Preferred resolution<SettingsSelect aria-label="Preferred resolution" value={String(settings.preferredResolution)} onValueChange={value => update({ preferredResolution: Number(value) })}>{[480,720,1080,1440,2160].map(value => <option key={value} value={value}>{value === 2160 ? '4K / 2160p' : `${value}p`}</option>)}</SettingsSelect></label>
        <label className="grid gap-2 text-sm">Maximum resolution<SettingsSelect aria-label="Maximum resolution" value={String(settings.maxResolution)} onValueChange={value => update({ maxResolution: Number(value) })}>{[480,720,1080,1440,2160].map(value => <option key={value} value={value}>{value === 2160 ? '4K / 2160p' : `${value}p`}</option>)}</SettingsSelect></label>
        <label className="grid gap-2 text-sm">Preferred codec<SettingsSelect aria-label="Preferred codec" value={settings.codec} onValueChange={value => { if (value === 'any' || value === 'H.264' || value === 'HEVC' || value === 'AV1') update({ codec: value }) }}><option value="any">No preference</option><option>H.264</option><option>HEVC</option><option>AV1</option></SettingsSelect></label>
        <label className="grid gap-2 text-sm">Preferred language<SettingsSelect aria-label="Preferred language" value={settings.language} onValueChange={language => update({ language })}><option value="any">No preference</option>{[['en','English'],['es','Spanish'],['fr','French'],['de','German'],['ja','Japanese'],['hi','Hindi'],['it','Italian']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</SettingsSelect></label>
      </div>
      <Range label="Resolution preference strength" value={settings.qualityWeight} max={100} display={`${settings.qualityWeight}%`} onChange={qualityWeight => update({ qualityWeight })} />
      <Range label="Prefer smaller files" value={settings.sizeWeight} max={100} display={`${settings.sizeWeight}%`} onChange={sizeWeight => update({ sizeWeight })} />
      <Range label="Maximum file size" value={settings.maxSizeGB} max={100} display={settings.maxSizeGB ? `${settings.maxSizeGB} GB` : 'No limit'} onChange={maxSizeGB => update({ maxSizeGB })} />
      <label className="grid gap-2 text-sm">Preferred provider<SettingsSelect aria-label="Preferred provider" value={settings.preferredAddon} onValueChange={preferredAddon => update({ preferredAddon })}><option value="">No preference</option>{addons.data?.map(addon => <option key={addon.id} value={addon.id}>{addon.manifest.name}</option>)}</SettingsSelect></label>
      <div className="grid gap-4 rounded-lg bg-muted/40 p-4">
        <label className="grid gap-2 text-sm">Cached streams<SettingsSelect aria-label="Cached streams" value={settings.cachedMode} onValueChange={value => { if (value === 'any' || value === 'prefer' || value === 'only') update({ cachedMode: value }) }}><option value="any">No preference</option><option value="prefer">Prefer cached</option><option value="only">Cached only</option></SettingsSelect></label>
        <label className="grid gap-2 text-sm">Cached indicator<input className="rounded-lg border border-border bg-background p-3" maxLength={80} placeholder="e.g. ⚡ or [cached]" value={settings.cachedIndicator} disabled={settings.cachedMode === 'any'} aria-invalid={needsIndicator || undefined} aria-describedby="cached-indicator-help" onChange={event => update({ cachedIndicator: event.target.value })} /></label>
        <p id="cached-indicator-help" className="text-xs text-muted-foreground">Enter the emoji or text your provider uses in a stream name, title, description, or filename. Prefer cached ranks matching streams first; Cached only requires a match for automatic playback.</p>
        {needsIndicator && <p role="alert" className="text-sm text-destructive">Enter a cached indicator before saving.</p>}
      </div>
      <div className="grid gap-4 rounded-lg bg-muted/40 p-4"><Checkbox label="Avoid camera recordings" checked={settings.excludeCam} onChange={excludeCam => update({ excludeCam })} /><Checkbox label="Allow HDR and Dolby Vision" checked={settings.allowHdr} onChange={allowHdr => update({ allowHdr })} /><Checkbox label="Allow unknown resolution, size, or HDR" checked={settings.allowUnknown} onChange={allowUnknown => update({ allowUnknown })} /></div>
      <label className="grid gap-2 text-sm">Exclude words<input className="rounded-lg border border-border bg-background p-3" placeholder="e.g. sample, dubbed" maxLength={500} value={settings.excludedWords} onChange={event => update({ excludedWords: event.target.value })} /><span className="text-xs text-muted-foreground">Separate words with commas. Provider labels are hints, not a guarantee of playback support.</span></label>
    </fieldset>
    <div className="grid gap-4 border-t border-border pt-5"><h3 className="font-medium">Next episode</h3><Checkbox label="Autoplay next episode" description="Continue after a cancellable countdown. Uses auto-pick when enabled; otherwise uses the first direct stream." checked={settings.autoplayNext} onChange={autoplayNext => update({ autoplayNext })} /><Range label="Countdown" value={settings.countdownSeconds} min={3} max={30} display={`${settings.countdownSeconds} seconds`} onChange={countdownSeconds => update({ countdownSeconds })} /><Range label="Start countdown before the end" value={settings.nextEpisodeLeadSeconds} max={600} display={settings.nextEpisodeLeadSeconds ? `${settings.nextEpisodeLeadSeconds} seconds remaining` : 'At the end'} onChange={nextEpisodeLeadSeconds => update({ nextEpisodeLeadSeconds })} /><p className="text-xs text-muted-foreground">The countdown begins this early, then plays the next episode. For short episodes it starts no earlier than halfway through.</p><p className="text-xs text-muted-foreground">Automatic playback works in Wadi. External players and copy-link mode keep a manual launch step.</p></div>
    <div className="grid gap-4 border-t border-border pt-5"><h3 className="font-medium">Watch progress</h3>
      <Range label="Count as started after" value={settings.ignoreStartSeconds} max={300} display={settings.ignoreStartSeconds ? `${settings.ignoreStartSeconds} seconds` : 'Immediately'} onChange={ignoreStartSeconds => update({ ignoreStartSeconds })} />
      <Range label="Count as finished with" value={settings.finishRemainingSeconds} max={600} display={settings.finishRemainingSeconds ? `${settings.finishRemainingSeconds} seconds remaining` : 'Nothing remaining'} onChange={finishRemainingSeconds => update({ finishRemainingSeconds })} />
      <p className="text-xs text-muted-foreground">Brief starts stay out of Continue Watching. Finished titles are marked watched. These device settings apply when playback progress is next saved and sync the result to your active profile. Short titles must reach at least halfway before counting as finished.</p>
    </div>
    <div className="flex justify-end border-t border-border pt-4">
      <Button type="button" disabled={!isDirty || needsIndicator} onClick={() => { saveSettings(draft); setDraft({}) }}>Save changes</Button>
    </div>
  </section>
}
function Checkbox({label,description,checked,disabled,onChange}:{label:string;description?:string;checked:boolean;disabled?:boolean;onChange:(value:boolean)=>void}) {
  return <label className={`flex items-center justify-between gap-5 text-sm ${disabled ? 'opacity-50' : ''}`}><span><span className="block font-medium">{label}</span>{description ? <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{description}</span> : null}</span><input type="checkbox" className="size-5 shrink-0 accent-primary" checked={checked} disabled={disabled} onChange={event=>onChange(event.target.checked)} /></label>
}
function Range({label,value,min=0,max,display,onChange}:{label:string;value:number;min?:number;max:number;display:string;onChange:(value:number)=>void}) {
  return <label className="grid gap-3 text-sm"><span className="flex justify-between gap-3"><span>{label}</span><span className="text-muted-foreground tabular-nums">{display}</span></span><input type="range" className="w-full accent-primary" min={min} max={max} value={value} onChange={event=>onChange(Number(event.target.value))} /></label>
}
