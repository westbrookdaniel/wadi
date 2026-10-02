import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { playerDefaultsQuery, queryKeys, updatePlayerDefaults } from '@/api/queries'
import type { PlayerPreferences } from '@/api/types'
import { SubtitlePreview } from '@/features/media/detail/player/subtitle-appearance'
import { Button } from '@/components/ui/button'
import { SettingsSelect } from '@/components/ui/settings-select'

export function SubtitleDefaultSettings() {
  const query = useQuery(playerDefaultsQuery)
  if (query.isError) return <p role="alert">Could not load subtitle defaults. <button type="button" onClick={() => void query.refetch()}>Retry</button></p>
  return query.data ? <SubtitleDefaultsForm initial={query.data} /> : <p>Loading subtitle defaults…</p>
}
function SubtitleDefaultsForm({ initial }: { initial: PlayerPreferences }) {
  const [value, setValue] = useState(initial)
  const client = useQueryClient()
  const save = useMutation({ mutationFn: () => updatePlayerDefaults(value), onSuccess: data => client.setQueryData(queryKeys.playerDefaults, data) })
  const patch = (change: Partial<PlayerPreferences>) => { setValue(current => ({ ...current, ...change })); save.reset() }
  return <form className="grid min-w-0 gap-4 rounded-xl border border-border p-4" onSubmit={event => { event.preventDefault(); save.mutate() }}>
    <h3 className="font-medium">Subtitle defaults</h3>
    <p className="text-sm text-muted-foreground">Saved on this device. Existing title customizations stay unchanged; choose “Use device defaults” in the player to reset a title.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1">Font scale<input aria-label="Default subtitle font scale" type="number" min="0.5" max="3" step="0.05" value={value.subtitle_size} onChange={event => { if (event.target.validity.valid && event.target.value) patch({ subtitle_size: Number(event.target.value) }) }} className="h-10 w-full rounded border px-3" /></label>
      <label className="grid gap-1">Outline weight (px)<input aria-label="Default subtitle outline weight" type="number" min="0" max="6" step="0.5" value={value.subtitle_outline_width ?? 1.5} onChange={event => { if (event.target.validity.valid && event.target.value) patch({ subtitle_outline_width: Number(event.target.value) }) }} className="h-10 w-full rounded border px-3" /></label>
      {([['subtitle_text_color', 'Text colour'], ['subtitle_outline_color', 'Outline colour'], ['subtitle_background_color', 'Background colour']] as const).map(([key, label]) => <label className="grid gap-1" key={key}>{label}<input aria-label={`Default subtitle ${label.toLowerCase()}`} value={value[key]} pattern="#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}" onChange={event => patch({ [key]: event.target.value })} className="h-10 w-full rounded border px-3" /></label>)}
      <label className="grid gap-1">Background opacity<input aria-label="Default subtitle background opacity" type="number" min="0" max="1" step="0.05" value={value.subtitle_background_opacity} onChange={event => { if (event.target.validity.valid && event.target.value) patch({ subtitle_background_opacity: Number(event.target.value) }) }} className="h-10 w-full rounded border px-3" /></label>
      <label className="grid gap-1">Border style<SettingsSelect aria-label="Default subtitle border style" value={value.subtitle_outline_style} onValueChange={subtitle_outline_style => patch({ subtitle_outline_style })}><option value="outline">Outline</option><option value="shadow">Shadow</option></SettingsSelect></label>
      <label className="grid gap-1">Font<SettingsSelect aria-label="Default subtitle font" value={value.subtitle_font_family} onValueChange={subtitle_font_family => patch({ subtitle_font_family })}><option value="sans-serif">Sans</option><option value="serif">Serif</option><option value="monospace">Monospace</option><option value="system-ui">System</option></SettingsSelect></label>
    </div>
    <SubtitlePreview value={{ subtitleSize: value.subtitle_size, subtitleTextColor: value.subtitle_text_color, subtitleBackgroundColor: value.subtitle_background_color, subtitleBackgroundOpacity: value.subtitle_background_opacity, subtitleOutlineColor: value.subtitle_outline_color, subtitleOutlineWidth: value.subtitle_outline_width ?? 1.5, subtitleOutlineStyle: value.subtitle_outline_style, subtitleFontFamily: value.subtitle_font_family }} />
    <Button type="submit" disabled={save.isPending}>Save subtitle defaults</Button>
    {save.isSuccess && <p role="status">Subtitle defaults saved on this device.</p>}
    {save.isError && <p role="alert">Could not save subtitle defaults.</p>}
  </form>
}
