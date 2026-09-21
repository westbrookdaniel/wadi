import type { ReactNode } from 'react'
import { navItems, type NavPath } from '@/features/app-shell/nav-items'
import { useDeviceStore } from '@/store/device-store'

export function TvShell({ children, activePath, pageKey, label, hideNavigation, onNavigate }: {
  children: ReactNode; activePath: string; pageKey: string; label: string
  hideNavigation: boolean; onNavigate: (path: NavPath) => void
}) {
  return <div className="tv-shell dark">
    {!hideNavigation ? <nav className="tv-rail" aria-label="Primary navigation" data-tv-region="navigation">
      <span className="tv-wordmark">wadi</span>
      {navItems.map(({ path, label: name, icon: Icon }) => <button type="button" key={path}
        data-tv-home={path === '/home' ? '' : undefined} aria-current={activePath === path ? 'page' : undefined} onClick={() => onNavigate(path)}>
        <Icon aria-hidden="true" /><span>{name}</span>
      </button>)}
      <button type="button" className="tv-exit" onClick={() => useDeviceStore.getState().setTvMode(false)}>Exit TV mode</button>
      <p className="tv-hint">Arrows to move<br />OK to choose<br />Back to return</p>
    </nav> : null}
    <main className={hideNavigation ? 'tv-main tv-main-player' : 'tv-main'} aria-label={label} data-tv-page={pageKey}>
      {children}
    </main>
  </div>
}
