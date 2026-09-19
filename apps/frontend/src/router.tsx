/* eslint-disable react-refresh/only-export-components */
import {
  Navigate,
  redirect,
  createRootRoute,
  createRoute,
  createRouter,
  defaultParseSearch,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { openExternalPlayback, externalPlayers } from '@/features/media/detail/external-players'
import { getStreamUrl } from '@/features/media/detail/stream-playback'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SettingsSelect } from '@/components/ui/settings-select'
import { readPlaybackSession, savePlaybackSession } from '@/features/media/detail/playback-session'

import { metaQuery, playbackPreferencesQuery } from '@/api/queries'
import type { MediaPreview } from '@/api/types'
import { AppShell } from '@/features/app-shell/app-shell'
import type { NavPath } from '@/features/app-shell/nav-items'
import { ProtectedRoute } from '@/features/app-shell/protected-route'
import { AccountSettingsPage, AddAddonPage, ProfileSettingsPage } from '@/features/app-shell/settings-page'
import { AuthPage } from '@/features/auth/auth-pages'
import { DiscoverPage } from '@/features/catalog/discover-page'
import { discoverSearchSchema } from '@/features/catalog/discover'
import { HomePage } from '@/features/catalog/home-page'
import { SearchPage } from '@/features/catalog/search-page'
import {
  DetailShellSkeleton,
  MediaDetailPage,
  StreamPlaybackPage,
  type PlaybackTarget,
  type PlayableStream,
} from '@/features/media/detail'
import {
  nextSeriesSearchState,
  preferredEpisodeIdFromSearch,
  type SeriesSearchState,
} from '@/features/media/detail/series-url-state'
import { WatchlistsPage } from '@/features/watchlists/watchlists-page'
import { WatchlistAddButton } from '@/features/watchlists/watchlist-add-button'
import { useAppStore } from '@/store/app-store'

const rootRoute = createRootRoute()

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => { throw redirect({ to: useAppStore.getState().token ? '/home' : '/login', replace: true }) },
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: () => <AuthRoute mode="login" />,
})

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  component: () => <AuthRoute mode="register" />,
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/home',
  component: () => (
    <BrowseRoute label="home page">
      {(openMedia, navigate) => (
        <HomePage
          onOpenMedia={openMedia}
          onOpenSettings={() => navigate({ to: '/settings' })}
        />
      )}
    </BrowseRoute>
  ),
})

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search',
  component: () => (
    <BrowseRoute label="search page">
      {(openMedia) => <SearchPage onOpenMedia={openMedia} />}
    </BrowseRoute>
  ),
})

const watchlistsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/watchlists',
  component: () => (
    <BrowseRoute label="watchlists page">
      {(openMedia) => <WatchlistsPage onOpenMedia={openMedia} />}
    </BrowseRoute>
  ),
})

const discoverRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/discover',
  validateSearch: search => discoverSearchSchema.parse(search),
  component: DiscoverRoute,
})
const moviesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/movies', component: () => <Navigate to="/discover" search={{ type: 'movie' }} replace /> })
const seriesRoute = createRoute({ getParentRoute: () => rootRoute, path: '/series', component: () => <Navigate to="/discover" search={{ type: 'series' }} replace /> })
function DiscoverRoute() {
  const search = discoverRoute.useSearch()
  const navigate = useNavigate()
  return <BrowseRoute label="Discover page">{openMedia => <DiscoverPage search={search} onChange={search => void navigate({ to: '/discover', search })} onOpenMedia={openMedia} />}</BrowseRoute>
}

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: ProfileSettingsRoute,
})

const accountSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/account',
  component: AccountSettingsRoute,
})

const pluginsSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings/plugins",
  component: () => <AccountSettingsRoute view="plugins" />,
})

const addAddonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/account/add-addon',
  component: AddAddonRoute,
})

const mediaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/media/$type/$id',
  validateSearch: (search: Record<string, unknown>): { playback?: string; videoId?: string; episode?: string; season?: string; from?: string } => ({
    playback: stringSearchParam(search.playback),
    videoId: stringSearchParam(search.videoId),
    episode: stringSearchParam(search.episode),
    season: stringSearchParam(search.season),
    from: stringSearchParam(search.from),
  }),
  component: MediaRoute,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  homeRoute,
  searchRoute,
  watchlistsRoute,
  discoverRoute,
  moviesRoute,
  seriesRoute,
  settingsRoute,
  accountSettingsRoute,
  pluginsSettingsRoute,
  addAddonRoute,
  mediaRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function AddAddonRoute() {
  const navigate = useNavigate()
  return (
    <ProtectedRoute>
      {() => (
        <AppShell activePath="/settings" label="add addon page" onNavigate={(path) => navigate({ to: path })}>
          <AddAddonPage />
        </AppShell>
      )}
    </ProtectedRoute>
  )
}

function AuthRoute({ mode }: { mode: 'login' | 'register' }) {
  const token = useAppStore((state) => state.token)
  const navigate = useNavigate()

  if (token) {
    return <Navigate to="/home" replace />
  }

  return (
    <AuthPage
      mode={mode}
      onModeChange={(nextMode) => {
        navigate({ to: nextMode === 'login' ? '/login' : '/register' })
      }}
    />
  )
}

function ProfileSettingsRoute() {
  const navigate = useNavigate()

  return (
    <ProtectedRoute>
      {() => (
        <AppShell
          activePath="/settings"
          label="settings page"
          onNavigate={(path) => navigate({ to: path })}
        >
          <ProfileSettingsPage />
        </AppShell>
      )}
    </ProtectedRoute>
  )
}

function AccountSettingsRoute({ view = "account" }: { view?: "account" | "plugins" }) {
  const navigate = useNavigate()

  return (
    <ProtectedRoute>
      {(user) => (
        <AppShell
          activePath="/settings"
          label="account settings page"
          onNavigate={(path) => navigate({ to: path })}
        >
          <AccountSettingsPage user={user} view={view} />
        </AppShell>
      )}
    </ProtectedRoute>
  )
}

function BrowseRoute({
  children,
  label,
}: {
  children: (
    openMedia: (media: MediaPreview, preferredVideoId?: string | null) => void,
    navigate: ReturnType<typeof useNavigate>,
  ) => React.ReactNode
  label: string
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const openMedia = (media: MediaPreview, preferredVideoId: string | null = null) => {
    navigate({
      to: '/media/$type/$id',
      params: {
        type: media.type,
        id: media.id,
      },
      search: {
        from: location.href,
        videoId: undefined,
        episode: preferredVideoId || undefined,
        season: undefined,
      },
    })
  }

  return (
    <ProtectedRoute>
      {() => (
        <AppShell
          activePath={location.pathname}
          label={label}
          onNavigate={(path) => navigate({ to: path })}
        >
          {children(openMedia, navigate)}
        </AppShell>
      )}
    </ProtectedRoute>
  )
}

function MediaRoute() {
  const playbackPrefs = useQuery(playbackPreferencesQuery)
  const [launchFailure, setLaunchFailure] = useState<{ stream: PlayableStream; message: string } | null>(null)
  const [chosenPlayer, setChosenPlayer] = useState("vlc")
  const navigate = useNavigate()
  const { type, id } = mediaRoute.useParams()
  const { videoId, episode, season, from, playback } = mediaRoute.useSearch()
  const session = useMemo(() => readPlaybackSession(playback, type, id), [playback, type, id])
  const selectedStream = session?.stream
  const selectedPlaybackTarget = session?.target
  const routeMedia = useQuery(metaQuery(type, id, true))
  const selectedMedia = mediaPreviewFromParams(type, id)
  const displayMedia = mediaPreviewFromMeta(selectedMedia, routeMedia.data) ?? selectedMedia
  const isLoadingMediaDetails = routeMedia.isLoading && !routeMedia.data
  const backPath = browsePath(from?.split('?')[0])
  const backSearch = backPath === '/discover' ? discoverSearchSchema.parse(defaultParseSearch(from?.includes('?') ? from.slice(from.indexOf('?')) : '')) : undefined

  const playStream = (stream: PlayableStream, target: PlaybackTarget) => {
    if (!playbackPrefs.data) {
      setLaunchFailure({ stream, message: 'Playback preferences are not ready. Choose a player below or try again.' }); return
    }
    if (playbackPrefs.data.stream_action === 'external') {
      const url = getStreamUrl(stream)
      if (!url) { setLaunchFailure({ stream, message: 'This stream has no playable link.' }); return }
      void openExternalPlayback(url, playbackPrefs.data).catch(error => setLaunchFailure({ stream, message: error instanceof Error ? error.message : 'Could not open player.' }))
      return
    }
    const key = savePlaybackSession(stream, target)
    void navigate({ to: '/media/$type/$id', params: { type, id }, search: previous => ({ ...previous, playback: key, episode: target.videoId ?? undefined, season: target.episodeContext?.season?.toString() }), replace: Boolean(playback) })
  }

  const updateSeriesSelection = ({
    season: nextSeason,
    episodeId,
  }: {
    season: number | null
    episodeId: string | null
  }) => {
    navigate({
      to: '/media/$type/$id',
      params: { type, id },
      search: (previous) => ({
        videoId: undefined,
        ...nextSeriesSearchState(previous as SeriesSearchState, nextSeason, episodeId),
      }),
      replace: true,
    })
  }

  return (
    <ProtectedRoute>
      {() => (
        <AppShell
          activePath={backPath}
          hideNavigation={Boolean(selectedStream)}
          className="p-0 max-[800px]:p-0"
          label={`${displayMedia.name} page`}
          onNavigate={(path) => navigate({ to: path })}
        >
          <Dialog open={Boolean(launchFailure)} onOpenChange={open => { if (!open) setLaunchFailure(null) }}>
            <DialogContent><DialogTitle>Open stream</DialogTitle><DialogDescription>{launchFailure?.message}</DialogDescription>
              <SettingsSelect aria-label="External player" value={chosenPlayer} onValueChange={setChosenPlayer}>{externalPlayers.filter(player => player.id !== 'custom').map(player => <option key={player.id} value={player.id}>{player.label}</option>)}</SettingsSelect>
              <Button onClick={() => {
                const url = launchFailure ? getStreamUrl(launchFailure.stream) : null
                if (!url) return
                const next = { stream_action: 'external', external_player_template: playbackPrefs.data?.external_player_template ?? 'vlc://{url}', external_player_preset: chosenPlayer } satisfies import('@/api/types').PlaybackPreferences
                void openExternalPlayback(url, next).then(() => setLaunchFailure(null)).catch(error => setLaunchFailure(current => current ? { ...current, message: error instanceof Error ? error.message : 'Could not open player.' } : null))
              }}>Open player</Button>
              <Button variant="secondary" onClick={async () => {
                const url = launchFailure ? getStreamUrl(launchFailure.stream) : null
                if (!url) return
                try { await navigator.clipboard.writeText(url); setLaunchFailure(current => current ? { ...current, message: 'Link copied.' } : null) }
                catch { setLaunchFailure(current => current ? { ...current, message: 'Clipboard access is unavailable. Select the link below and copy it manually.' } : null) }
              }}>Copy link</Button>
              <textarea aria-label="Stream link" readOnly value={launchFailure ? getStreamUrl(launchFailure.stream) ?? "" : ""} className="w-full rounded-lg border p-3 text-sm" onFocus={event => event.currentTarget.select()} />
            </DialogContent>
          </Dialog>
          {selectedStream && selectedPlaybackTarget ? (
            <StreamPlaybackPage
              media={displayMedia}
              stream={selectedStream}
              target={selectedPlaybackTarget}
              onPlaybackChange={playStream}
              onBack={() => {
                void navigate({ to: '/media/$type/$id', params: { type, id }, search: previous => ({ ...previous, playback: undefined }), replace: true })
              }}
            />
          ) : isLoadingMediaDetails ? (
            <DetailShellSkeleton onBack={() => navigate({ to: backPath, search: backSearch })} />
          ) : (
            <MediaDetailPage
              media={displayMedia}
              preferredVideoId={preferredEpisodeIdFromSearch({ episode, videoId })}
              preferredSeason={season}
              onSeriesSelectionChange={updateSeriesSelection}
              onBack={() => navigate({ to: backPath, search: backSearch })}
              onPlay={playStream}
              listAction={<WatchlistAddButton media={displayMedia} />}
            />
          )}
        </AppShell>
      )}
    </ProtectedRoute>
  )
}

function mediaPreviewFromParams(type: string, id: string): MediaPreview {
  return {
    id,
    type,
    name: id,
    raw: { id, type },
  }
}

function mediaPreviewFromMeta(media: MediaPreview, data: unknown): MediaPreview | null {
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

function browsePath(path: string | undefined): NavPath {
  return path === '/search' ||
    path === '/watchlists' ||
    path === '/discover' ||
    path === '/settings'
    ? path
    : '/home'
}

function stringSearchParam(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
