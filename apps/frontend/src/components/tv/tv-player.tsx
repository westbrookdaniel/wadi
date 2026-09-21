import { skipLabels, type SkipSegment } from '@/features/media/detail/player/skip-segments'
import { useEffect, useRef, useState } from 'react'
import { nearestTarget } from '@/components/tv-spatial'
import { canControlPlayback, type PlayerState } from '@/features/media/detail/player/state'
import { TvPicker } from './tv-picker'

type Props = {
  skipSegment?: SkipSegment
  mediaName: string; state: PlayerState; warning: string | null; hasEpisodeSwapper: boolean
  onBack: () => void; onTogglePlay: () => void; onSeek: (value: number) => void; onOpenEpisodeSwapper: () => void
  subtitleTracks: { id: string; language: string; source: string }[]; selectedSubtitleId: string | null
  onSelectSubtitle: (id: string | null) => void; onSelectAudioTrack: (id: string | null) => void
  playbackSpeed: number; onPlaybackSpeedChange: (value: number) => void
  subtitleDelay: number; onSubtitleDelayChange: (value: number) => void
  subtitleSize: number; onSubtitleSizeChange: (value: number) => void
}

export function TvPlayerChrome(props: Props) {
  const { state } = props
  const [dismissedSkip, setDismissedSkip] = useState<SkipSegment | undefined>(undefined)
  const skipVisible = Boolean(props.skipSegment && props.skipSegment !== dismissedSkip)
  const [visible, setVisible] = useState(true)
  const controlsVisible = visible || skipVisible
  const [seek, setSeek] = useState<number | null>(null)
  const [activity, setActivity] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const timeline = useRef<HTMLButtonElement>(null)
  const seeking = seek !== null
  const play = useRef<HTMLButtonElement>(null)
  const latest = useRef(props)
  useEffect(() => { latest.current = props }, [props])
  const disabled = !canControlPlayback(state)
  useEffect(() => {
    if (!visible || skipVisible || !state.playing || seek !== null || disabled) return
    const timer = window.setInterval(() => {
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      setVisible(false)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [visible, skipVisible, state.playing, seek, activity, disabled])
  useEffect(() => {
    if (document.querySelector('[role="dialog"]')) return
    if (controlsVisible) (seeking ? timeline : play).current?.focus()
    else root.current?.focus()
  }, [controlsVisible, seeking])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || document.querySelector('[role="dialog"], [role="alertdialog"], [role="listbox"], [role="menu"]')) return
      if (!['Enter', 'Escape', 'BrowserBack', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'MediaPlayPause'].includes(event.key)) return
      const current = latest.current
      const back = event.key === 'Escape' || event.key === 'BrowserBack'
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
      event.preventDefault(); event.stopImmediatePropagation()
      if (event.repeat && !event.key.startsWith('Arrow')) return
      setActivity(count => count + 1)
      if (seek !== null) {
        if (back) setSeek(null)
        else if (event.key === 'Enter') { current.onSeek(seek); setSeek(null) }
        else if (horizontal) setSeek(value => Math.max(0, Math.min(current.state.duration, (value ?? current.state.currentTime) + (event.key === 'ArrowLeft' ? -10 : 10))))
        return
      }
      if (back) { if (controlsVisible) { setVisible(false); setDismissedSkip(current.skipSegment) } else current.onBack(); return }
      if (event.key === ' ' || event.key === 'MediaPlayPause') { if (!event.repeat && canControlPlayback(current.state)) { current.onTogglePlay(); setVisible(true) } return }
      if (!controlsVisible) {
        setVisible(true)
        if (horizontal && canControlPlayback(current.state)) setSeek(Math.max(0, Math.min(current.state.duration, current.state.currentTime + (event.key === 'ArrowLeft' ? -10 : 10))))
        return
      }
      if (event.key === 'Enter') {
        if (!event.repeat && document.activeElement instanceof HTMLElement) document.activeElement.click()
        return
      }
      const items = [...root.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []].filter(element => element.getClientRects().length)
      const active = document.activeElement
      const next = active instanceof HTMLElement && items.includes(active) ? nearestTarget(active.getBoundingClientRect(), items.filter(item => item !== active), event.key) : items[0]
      next?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [controlsVisible, seek])
  if (state.error) return null
  const position = seek ?? state.currentTime
  return <div ref={root} data-tv-player tabIndex={0} aria-label="Video player" className="tv-player"
    onFocusCapture={() => setActivity(count => count + 1)}
    onPointerMove={() => { setVisible(true); setActivity(count => count + 1) }}>
    {controlsVisible ? <div className="tv-player-controls">
      <header><button type="button" onClick={props.onBack}>← Back</button><h1>{props.mediaName}</h1></header>
      <div className="tv-player-bottom">
        {props.warning ? <p role="status">{props.warning}</p> : null}
        <button type="button" ref={timeline} className="tv-timeline" aria-label="Seek" disabled={disabled}
          onClick={() => setSeek(state.currentTime)}>
          <span className="tv-timeline-track"><span style={{ width: `${state.duration ? position / state.duration * 100 : 0}%` }} /></span>
          <span>{timestamp(position)} / {timestamp(state.duration)}</span>
        </button>
        {seek !== null ? <div className="tv-seeking" role="status"><strong>{timestamp(seek)}</strong><p>← / → seek 10 seconds · OK applies · Back cancels</p>
          <div><button type="button" onClick={() => setSeek(Math.max(0, seek - 10))}>−10 seconds</button><button type="button" onClick={() => { props.onSeek(seek); setSeek(null) }}>Apply seek</button><button type="button" onClick={() => setSeek(Math.min(state.duration, seek + 10))}>+10 seconds</button><button type="button" onClick={() => setSeek(null)}>Cancel</button></div>
        </div> : <div className="tv-player-actions">
          <button ref={play} type="button" data-tv-default className="tv-primary" disabled={disabled} onClick={props.onTogglePlay}>{state.playing ? 'Pause' : 'Play'}</button>
          {props.skipSegment ? <button type="button" onClick={() => props.onSeek(props.skipSegment!.end)}>{skipLabels[props.skipSegment.type]}</button> : null}
          {props.hasEpisodeSwapper ? <button type="button" onClick={props.onOpenEpisodeSwapper}>Episodes</button> : null}
          <TvPicker label="Audio" value={state.selectedAudioTrackId ?? ''} disabled={!state.audioTracks.length} options={state.audioTracks.map(track => ({ value: track.id, label: track.label || track.language }))} onChange={props.onSelectAudioTrack} />
          <TvPicker label="Subtitles" value={props.selectedSubtitleId ?? '__off'} options={[{ value: '__off', label: 'Subtitles off' }, ...props.subtitleTracks.map(track => ({ value: track.id, label: `${track.language} · ${track.source}` }))]} onChange={value => props.onSelectSubtitle(value === '__off' ? null : value)} />
          <TvPicker label="Playback speed" value={String(props.playbackSpeed)} options={[0.5, 0.75, 1, 1.25, 1.5, 2].map(value => ({ value: String(value), label: `${value}× speed` }))} onChange={value => props.onPlaybackSpeedChange(Number(value))} />
          <TvPicker label="Subtitle size" value={String(props.subtitleSize)} options={[0.75, 1, 1.25, 1.5, 2].map(value => ({ value: String(value), label: `${value}× subtitles` }))} onChange={value => props.onSubtitleSizeChange(Number(value))} />
          <TvPicker label="Subtitle timing" value={String(props.subtitleDelay)} options={[-10, -5, -2, -1, 0, 1, 2, 5, 10].map(value => ({ value: String(value), label: `${value > 0 ? '+' : ''}${value}s subtitle delay` }))} onChange={value => props.onSubtitleDelayChange(Number(value))} />
        </div>}
        <p className="tv-hint">OK shows controls · Back hides controls, then returns</p>
      </div>
    </div> : null}
  </div>
}
function timestamp(value: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
