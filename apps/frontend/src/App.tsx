import {
  Clapperboard,
  Home,
  Plus,
  Search,
  Tv,
  User,
} from 'lucide-react'
import { useState } from 'react'
import './App.css'

type Page = 'home' | 'search' | 'watchlists' | 'movies' | 'series' | 'profile'

const navItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'watchlists', label: 'Watchlists', icon: Plus },
  { id: 'movies', label: 'Movies', icon: Clapperboard },
  { id: 'series', label: 'Series', icon: Tv },
  { id: 'profile', label: 'Settings', icon: User },
] satisfies Array<{
  id: Page
  label: string
  icon: typeof Home
}>

function App() {
  const [activePage, setActivePage] = useState<Page>('home')

  return (
    <div className="app-shell dark">
      <aside className="sidebar" aria-label="Primary navigation">
        <nav className="sidebar-nav">
          {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = activePage === id

            return (
              <button
                key={id}
                type="button"
                className="nav-button"
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
                data-active={isActive}
                onClick={() => setActivePage(id)}
                title={label}
              >
                <Icon aria-hidden="true" />
                <span className="nav-tooltip" role="presentation">
                  {label}
                </span>
              </button>
            )
          })}
        </nav>
      </aside>

      <main className="page-surface" aria-label={`${activePage} page`} />
    </div>
  )
}

export default App
