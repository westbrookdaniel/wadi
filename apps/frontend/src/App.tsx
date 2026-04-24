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
import { appBackground } from '@/lib/styles'
import { cn } from '@/lib/utils'
import { CatalogPage } from '@/pages/catalog-page'
import { HomePage } from '@/pages/home-page'
import { SearchPage } from '@/pages/search-page'
import { SettingsPage } from '@/pages/settings-page'
import { WatchlistsPage } from '@/pages/watchlists-page'
import { useAppStore } from '@/store/app-store'

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
      <main className={cn('grid min-h-svh content-center justify-items-center gap-[clamp(34px,7vh,72px)] px-6 py-[clamp(36px,8vw,96px)]', appBackground)}>
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
      <main className={cn('grid min-h-svh content-center justify-items-center gap-[clamp(34px,7vh,72px)] px-6 py-[clamp(36px,8vw,96px)]', appBackground)}>
        <LoadingState label="Preparing app" />
      </main>
    )
  }

  return (
    <div className={cn('dark min-h-svh', appBackground)}>
      {selectedMedia && selectedStream ? null : (
        <aside
          className="fixed inset-y-0 left-0 z-20 grid w-[88px] place-items-center max-[800px]:inset-x-0 max-[800px]:top-auto max-[800px]:bottom-0 max-[800px]:h-[72px] max-[800px]:w-auto"
          aria-label="Primary navigation"
        >
          <nav className="grid gap-3 max-[800px]:flex max-[800px]:gap-2">
            {navItems.map(({ id, label, icon: Icon }) => {
              const isActive = activePage === id

              return (
                <button
                  key={id}
                  type="button"
                  className={cn(
                    'group relative grid size-12 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-[hsl(240_6%_58%)] transition-[color,background-color,transform] duration-200 ease-out focus-visible:bg-[hsl(0_0%_100%/7%)] focus-visible:text-[hsl(0_0%_88%)] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[hsl(322_100%_72%/72%)] hover:bg-[hsl(0_0%_100%/7%)] hover:text-[hsl(0_0%_88%)] max-[800px]:size-11 [&_svg]:size-[22px] [&_svg]:transition-[transform,stroke-width] [&_svg]:duration-200 [&_svg]:ease-out',
                    isActive &&
                      'scale-[1.08] bg-[hsl(0_0%_100%/10%)] text-[hsl(0_0%_98%)] [&_svg]:scale-[1.16] [&_svg]:stroke-[2.35]',
                  )}
                  aria-label={label}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    setActivePage(id)
                    setSelectedMedia(null)
                    setSelectedStream(null)
                    window.history.pushState(null, '', `/${id}`)
                  }}
                  title={label}
                >
                  <Icon aria-hidden="true" />
                  <span
                    className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-30 w-max max-w-[180px] origin-left -translate-y-1/2 translate-x-[-4px] scale-95 rounded-[7px] border border-[hsl(0_0%_100%/10%)] bg-[hsl(240_12%_8%/92%)] px-[9px] py-1.5 text-xs leading-none text-[hsl(0_0%_96%)] opacity-0 shadow-[0_12px_28px_hsl(0_0%_0%/28%)] transition-[opacity,transform] duration-150 group-focus-visible:translate-x-0 group-focus-visible:scale-100 group-focus-visible:opacity-100 group-hover:translate-x-0 group-hover:scale-100 group-hover:opacity-100 max-[800px]:left-1/2 max-[800px]:top-auto max-[800px]:bottom-[calc(100%+10px)] max-[800px]:origin-bottom max-[800px]:-translate-x-1/2 max-[800px]:translate-y-1 max-[800px]:group-focus-visible:-translate-x-1/2 max-[800px]:group-focus-visible:translate-y-0 max-[800px]:group-hover:-translate-x-1/2 max-[800px]:group-hover:translate-y-0"
                    role="presentation"
                  >
                    {label}
                  </span>
                </button>
              )
            })}
          </nav>
        </aside>
      )}

      <main
        className={cn(
          'ml-[88px] min-h-svh px-[clamp(18px,4vw,56px)] py-[clamp(28px,4vw,56px)] max-[800px]:ml-0 max-[800px]:mb-[72px] max-[800px]:min-h-[calc(100svh-72px)] max-[800px]:p-[22px]',
          selectedMedia && 'p-0 max-[800px]:p-0',
          selectedMedia && selectedStream && 'ml-0 mb-0 min-h-svh max-[800px]:mb-0',
        )}
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
