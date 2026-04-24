import { useQuery } from '@tanstack/react-query'
import {
  Clapperboard,
  Home,
  Plus,
  Search,
  Tv,
  User,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { meQuery, metaQuery } from '@/api/queries'
import type { MediaPreview, Page } from '@/api/types'
import { AuthPage } from '@/components/auth-pages'
import { MediaDetailPage, MediaPlayerPage, type PlayableStream } from '@/components/media-detail'
import { LoadingState } from '@/components/status'
import { WatchlistAddButton } from '@/components/watchlist-add-button'
import { CatalogPage } from '@/pages/catalog-page'
import { HomePage } from '@/pages/home-page'
import { SearchPage } from '@/pages/search-page'
import { SettingsPage } from '@/pages/settings-page'
import { WatchlistsPage } from '@/pages/watchlists-page'
import { useAppStore } from '@/store/app-store'
import './App.css'

const navItems = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'watchlists', label: 'Watchlists', icon: Plus },
  { id: 'movies', label: 'Movies', icon: Clapperboard },
  { id: 'series', label: 'Series', icon: Tv },
  { id: 'settings', label: 'Settings', icon: User },
] satisfies Array<{
  id: Page
  label: string
  icon: typeof Home
}>

const pageFromPath = (): Page | 'login' | 'register' => {
  const segment = window.location.pathname.replace(/^\//, '')

  if (segment === 'register') {
    return 'register'
  }

  if (segment === 'login') {
    return 'login'
  }

  if (navItems.some((item) => item.id === segment)) {
    return segment as Page
  }

  return 'home'
}

const mediaFromPath = (): MediaPreview | null => {
  const [, section, type, id] = window.location.pathname.split('/')

  if (section !== 'media' || !type || !id) {
    return null
  }

  const mediaId = decodeURIComponent(id)

  return {
    id: mediaId,
    type: decodeURIComponent(type),
    name: mediaId,
    raw: { id: mediaId, type },
  }
}

const mediaPath = (media: MediaPreview) =>
  `/media/${encodeURIComponent(media.type)}/${encodeURIComponent(media.id)}`

function App() {
  const token = useAppStore((state) => state.token)
  const activePage = useAppStore((state) => state.activePage)
  const setActivePage = useAppStore((state) => state.setActivePage)
  const [authPage, setAuthPage] = useState<'login' | 'register'>(() => {
    const route = pageFromPath()
    return route === 'register' ? 'register' : 'login'
  })
  const [selectedMedia, setSelectedMedia] = useState<MediaPreview | null>(() => mediaFromPath())
  const [selectedStream, setSelectedStream] = useState<PlayableStream | null>(null)

  const me = useQuery(meQuery(Boolean(token)))
  const routeMedia = useQuery(
    metaQuery(selectedMedia?.type ?? '', selectedMedia?.id ?? '', Boolean(selectedMedia)),
  )

  useEffect(() => {
    if (!token) {
      window.history.replaceState(null, '', `/${authPage}`)
      return
    }

    if (me.isSuccess && !selectedMedia) {
      window.history.replaceState(null, '', `/${activePage}`)
    }
  }, [activePage, authPage, me.isSuccess, selectedMedia, token])

  const displayMedia = mediaPreviewFromMeta(selectedMedia, routeMedia.data) ?? selectedMedia

  const openMedia = (media: MediaPreview) => {
    setSelectedStream(null)
    setSelectedMedia(media)
    window.history.pushState(null, '', mediaPath(media))
  }

  const backToBrowse = () => {
    setSelectedStream(null)
    setSelectedMedia(null)
    window.history.pushState(null, '', `/${activePage}`)
  }

  if (!token) {
    return (
      <AuthPage
        mode={authPage}
        onModeChange={(mode) => {
          setAuthPage(mode)
          window.history.pushState(null, '', `/${mode}`)
        }}
      />
    )
  }

  if (me.isLoading) {
    return (
      <main className="auth-screen">
        <LoadingState label="Restoring session" />
      </main>
    )
  }

  if (me.isError) {
    return (
      <AuthPage
        mode="login"
        onModeChange={(mode) => {
          setAuthPage(mode)
          window.history.pushState(null, '', `/${mode}`)
        }}
      />
    )
  }

  if (!me.data) {
    return (
      <main className="auth-screen">
        <LoadingState label="Preparing app" />
      </main>
    )
  }

  return (
    <div className="app-shell dark">
      {selectedMedia && selectedStream ? null : (
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
                  onClick={() => {
                    setActivePage(id)
                    setSelectedMedia(null)
                    setSelectedStream(null)
                    window.history.pushState(null, '', `/${id}`)
                  }}
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
      )}

      <main
        className={`page-surface ${selectedMedia ? 'page-surface-detail' : ''} ${
          selectedMedia && selectedStream ? 'page-surface-player' : ''
        }`}
        aria-label={displayMedia ? `${displayMedia.name} page` : `${activePage} page`}
      >
        {displayMedia && selectedStream ? (
          <MediaPlayerPage
            media={displayMedia}
            stream={selectedStream}
            onBack={() => setSelectedStream(null)}
          />
        ) : displayMedia ? (
          <MediaDetailPage
            media={displayMedia}
            onBack={backToBrowse}
            onPlay={setSelectedStream}
            listAction={<WatchlistAddButton media={displayMedia} />}
          />
        ) : (
          <>
            {activePage === 'home' ? <HomePage onOpenMedia={openMedia} /> : null}
            {activePage === 'search' ? <SearchPage onOpenMedia={openMedia} /> : null}
            {activePage === 'watchlists' ? <WatchlistsPage onOpenMedia={openMedia} /> : null}
            {activePage === 'movies' ? (
              <CatalogPage type="movie" title="Movies" onOpenMedia={openMedia} />
            ) : null}
            {activePage === 'series' ? (
              <CatalogPage type="series" title="Series" onOpenMedia={openMedia} />
            ) : null}
            {activePage === 'settings' ? <SettingsPage user={me.data} /> : null}
          </>
        )}
      </main>
    </div>
  )
}

export default App

function mediaPreviewFromMeta(media: MediaPreview | null, data: unknown): MediaPreview | null {
  if (!media || media.name !== media.id) {
    return null
  }

  const responses =
    data && typeof data === 'object' && 'responses' in data && Array.isArray(data.responses)
      ? data.responses
      : []

  for (const response of responses) {
    if (!response || typeof response !== 'object') {
      continue
    }

    const body = 'response' in response ? response.response : null
    const meta =
      body && typeof body === 'object' && 'meta' in body && body.meta && typeof body.meta === 'object'
        ? (body.meta as Record<string, unknown>)
        : null

    if (!meta) {
      continue
    }

    const name = stringValue(meta.name) ?? stringValue(meta.title)
    if (!name) {
      continue
    }

    return {
      id: stringValue(meta.id) ?? media.id,
      type: stringValue(meta.type) ?? media.type,
      name,
      poster: stringValue(meta.poster),
      releaseInfo: stringValue(meta.releaseInfo) ?? stringValue(meta.year),
      description: stringValue(meta.description),
      raw: meta,
    }
  }

  return null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
