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
import {
  MediaDetailPage,
  MediaPlayerPage,
  type PlaybackTarget,
  type PlayableStream,
} from '@/components/media-detail'
import { LoadingState } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
  const [selectedPlaybackTarget, setSelectedPlaybackTarget] = useState<PlaybackTarget | null>(null)
  const [preferredVideoId, setPreferredVideoId] = useState<string | null>(null)

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

  const openMedia = (media: MediaPreview, videoId: string | null = null) => {
    setSelectedStream(null)
    setSelectedPlaybackTarget(null)
    setPreferredVideoId(videoId)
    setSelectedMedia(media)
    window.history.pushState(null, '', mediaPath(media))
  }

  const backToBrowse = () => {
    setSelectedStream(null)
    setSelectedPlaybackTarget(null)
    setPreferredVideoId(null)
    setSelectedMedia(null)
    window.history.pushState(null, '', `/${activePage}`)
  }

  const playStream = (stream: PlayableStream, target: PlaybackTarget) => {
    setSelectedPlaybackTarget(target)
    setSelectedStream(stream)
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
                <Tooltip key={id}>
                  <TooltipTrigger asChild>
                <Button
                  key={id}
                  variant="ghost"
                  size="icon-lg"
                  type="button"
                  className={cn(
                    'size-13 rounded-full text-muted-foreground transition-[color,background-color,transform] duration-200 ease-out hover:bg-muted hover:text-foreground max-[800px]:size-12 [&_svg]:size-6 [&_svg]:transition-[transform,stroke-width] [&_svg]:duration-200 [&_svg]:ease-out',
                    isActive &&
                      'scale-[1.06] bg-muted text-foreground [&_svg]:scale-[1.12] [&_svg]:stroke-[2.35]',
                  )}
                  aria-label={label}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    setActivePage(id)
                    setSelectedMedia(null)
                    setSelectedStream(null)
                    setSelectedPlaybackTarget(null)
                    setPreferredVideoId(null)
                    window.history.pushState(null, '', `/${id}`)
                  }}
                  title={label}
                >
                  <Icon aria-hidden="true" />
                </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-[800px]:hidden">
                    {label}
                  </TooltipContent>
                </Tooltip>
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
        {displayMedia && selectedStream && selectedPlaybackTarget ? (
          <MediaPlayerPage
            media={displayMedia}
            stream={selectedStream}
            target={selectedPlaybackTarget}
            onBack={() => {
              setSelectedStream(null)
              setSelectedPlaybackTarget(null)
            }}
          />
        ) : displayMedia ? (
          <MediaDetailPage
            media={displayMedia}
            preferredVideoId={preferredVideoId}
            onBack={backToBrowse}
            onPlay={playStream}
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
  if (!media) {
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

    const metaId = stringValue(meta.id)
    const metaType = stringValue(meta.type)
    if (metaId && metaId !== media.id) {
      continue
    }
    if (metaType && metaType !== media.type) {
      continue
    }

    const name = stringValue(meta.name) ?? stringValue(meta.title) ?? media.name
    if (!name) {
      continue
    }

    return {
      id: metaId ?? media.id,
      type: metaType ?? media.type,
      name,
      poster: stringValue(meta.poster) ?? media.poster,
      releaseInfo: stringValue(meta.releaseInfo) ?? stringValue(meta.year) ?? media.releaseInfo,
      description: stringValue(meta.description) ?? media.description,
      raw: meta,
    }
  }

  return null
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
