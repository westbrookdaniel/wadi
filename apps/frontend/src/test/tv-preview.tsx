/* eslint-disable react-refresh/only-export-components -- standalone development fixture entry */
// Local visual fixture: pnpm --filter frontend exec vite --host 127.0.0.1
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import '@/index.css'
import '@/components/tv/tv.css'
import { TvNavigation } from '@/components/tv-navigation'
import { TvShell } from '@/components/tv/tv-shell'
import { TvDetail } from '@/components/tv/tv-detail'
import { TvPlayerChrome } from '@/components/tv/tv-player'
import { SettingsSelect } from '@/components/ui/settings-select'
import { useDeviceStore } from '@/store/device-store'
import { initialPlayerState } from '@/features/media/detail/player/state'
import { MediaRow } from '@/components/media-row'
useDeviceStore.setState({ tvMode: true })
function Preview() {
  const [page, setPage] = useState('home')
  const [season, setSeason] = useState('1')
  const [query, setQuery] = useState('')
  const [playing, setPlaying] = useState(true)
  const [time, setTime] = useState(180)
  const titles = ['The Long Way Home', 'Wild Coast', 'Beyond the Stars', 'Nightfall', 'The Last Garden', 'Blue Horizon']
  return <><TvNavigation /><TvShell pageKey={page} activePath={'/' + page} label={page} hideNavigation={page === 'player'} onNavigate={path => setPage(path.slice(1))}>
    {page === 'home' || page === 'discover' || page === 'watchlists' ? <div className="tv-home"><header><p className="tv-eyebrow">Your next watch</p><h1>Make yourself comfortable.</h1></header>{['Continue Watching', 'Your collection'].map((row, index) => <section key={row}><h2>{row}</h2><MediaRow>{titles.map((title, i) => <article className="media-card-item" key={title}><button data-tv-focus-key={`${row}:${title}`} onClick={() => setPage('detail')} style={{ aspectRatio: '2/3', borderRadius: '.6rem', background: `linear-gradient(145deg, hsl(${i * 55 + index * 20} 30% 35%), #171820)`, padding: '1rem', textAlign: 'left', display: 'flex', alignItems: 'end', fontSize: '1.5rem' }}>{title}</button><h3>{title}</h3><p>Film · 2026</p></article>)}</MediaRow></section>)}</div> : null}
    {page === 'detail' ? <TvDetail media={{ id: 'demo', type: 'series', name: titles[0], description: 'A journey through unfamiliar places, and the people who make them feel like home.', raw: {} }} sideLabel="Episodes" sideTitle="Episodes" onBack={() => setPage('home')} sideContent={<><SettingsSelect aria-label="Season" value={season} onValueChange={setSeason}>{[1,2,3,4].map(value => <option value={value} key={value}>Season {value}</option>)}</SettingsSelect>{['A new beginning', 'Into the unknown', 'Finding home'].map((title, i) => <button key={title} data-tv-default={i === 0 ? '' : undefined} onClick={() => setPage('player')}>{i + 1}. {title} — Play</button>)}</>} /> : null}
    {page === 'search' ? <><h1>Search</h1><input aria-label="Search films and series" value={query} onChange={event => setQuery(event.target.value)} /><p>Searching for: {query}</p></> : null}
    {page === 'settings' ? <><h1>Settings</h1><label>Appearance<SettingsSelect aria-label="Appearance" value={season} onValueChange={setSeason}><option value="1">Dark</option><option value="2">Light</option></SettingsSelect></label></> : null}
    {page === 'player' ? <div className="player-viewport" style={{ height: '100dvh', position: 'relative', background: 'linear-gradient(135deg, #26382f, #121e32)' }}><TvPlayerChrome mediaName={titles[0]} state={{ ...initialPlayerState, status: 'ready', playing, duration: 3600, currentTime: time }} warning={null} hasEpisodeSwapper={false} onBack={() => setPage('detail')} onTogglePlay={() => setPlaying(!playing)} onSeek={setTime} onOpenEpisodeSwapper={() => {}} subtitleTracks={[{ id: 'en', language: 'English', source: 'Embedded' }]} selectedSubtitleId={null} onSelectSubtitle={() => {}} onSelectAudioTrack={() => {}} playbackSpeed={1} onPlaybackSpeedChange={() => {}} subtitleDelay={0} onSubtitleDelayChange={() => {}} subtitleSize={1} onSubtitleSizeChange={() => {}} /></div> : null}
  </TvShell></>
}
createRoot(document.getElementById('root')!).render(<Preview />)
