import { episodeCatalogSchema } from '@/features/media/detail/episode-catalog'
import { parseStreamMetadata } from '@/features/media/detail/stream-metadata'
import { resetDeviceOverride, devicePlayback, saveDevicePlayback, devicePlayer, saveDevicePlayer, deviceOverride, saveDeviceOverride } from '@/store/playback-settings'
import { useAppStore } from '@/store/app-store'
import type { PlayerOverride, PlayerPreferences, SubtitleInfo, WatchProgressRequest } from './types'
import { queryOptions } from '@tanstack/react-query'

import { ApiError, apiRequest } from '@/api/client'
import type {
  AddonRecord,
  AddonPreview,
  ApiListResponse,
  ApiResponses,
  AuthResponse,
  VerificationRequired,
  BrowseLayout,
  CatalogEntry,
  ContinueWatchingItem,
  ListItem,
  MediaPreview,
  PlaybackPreferences,
  Profile,
  StreamInfo,
  User,
  UserList,
  WatchDataResponse,
  WatchState,
  WatchStateRequest,
} from '@/api/types'

function scopedKey<const T extends readonly unknown[]>(key: T) {
  const { authRevision, activeProfileId } = useAppStore.getState()
  return [...key, { authRevision, profileId: activeProfileId }] as const
}

export const queryKeys = {
  playerDefaults: ['player-defaults'] as const,
  playerOverride: (type: string, id: string, profileId = useAppStore.getState().activeProfileId) => scopedKey(['player-override', type, id, profileId]),
  subtitles: (type: string, id: string, context: Record<string, string> = {}) => scopedKey(['subtitles', type, id, context]),
  get me() { return scopedKey(['me']) },
  get addons() { return scopedKey(['addons']) },
  get catalogs() { return scopedKey(['catalogs']) },
  catalog: (type: string, id: string, extras: Record<string, string> = {}) =>
    scopedKey(['catalog', type, id, extras]),
  get lists() { return scopedKey(['lists']) },
  listItems: (listId: string | null) => scopedKey(['list-items', listId]),
  meta: (type: string, id: string) => scopedKey(['meta', type, id]),
  streams: (type: string, id: string) => scopedKey(['streams', type, id]),
  watchData: (type: string, id: string) => scopedKey(['watch-data', type, id]),
  continueWatching: (limit = 20) => scopedKey(['continue-watching', limit]),
  get browseLayout() { return scopedKey(['browse-layout']) },
  get profiles() { return scopedKey(['profiles']) },
  playbackPreferences: ['playback-preferences'] as const,
}

export const meQuery = (enabled: boolean) =>
  queryOptions({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => apiRequest<User>('/api/auth/me', { signal }),
    enabled,
    retry: false,
  })

export const addonsQuery = () => queryOptions({
  queryKey: queryKeys.addons,
  queryFn: async ({ signal }) => {
    const data = await apiRequest<ApiListResponse<AddonRecord>>('/api/addons', { signal })
    return data.items
  },
})

export const catalogsQuery = () => queryOptions({
  queryKey: queryKeys.catalogs,
  queryFn: async ({ signal }) => {
    const data = await apiRequest<ApiListResponse<CatalogEntry>>('/api/catalogs', { signal })
    return data.items
  },
})

export const listsQuery = () => queryOptions({
  queryKey: queryKeys.lists,
  queryFn: async ({ signal }) => {
    const data = await apiRequest<ApiListResponse<UserList>>('/api/lists', { signal })
    return data.items
  },
})

export const listItemsQuery = (listId: string | null) =>
  queryOptions({
    queryKey: queryKeys.listItems(listId),
    queryFn: async ({ signal }) => {
      const data = await apiRequest<ApiListResponse<ListItem>>(`/api/lists/${listId}/items`, { signal })
      return data.items
    },
    enabled: Boolean(listId),
  })

export const catalogQuery = (
  contentType: string,
  catalogId: string,
  extras: Record<string, string> = {},
  enabled = true,
) =>
  queryOptions({
    queryKey: queryKeys.catalog(contentType, catalogId, extras),
    queryFn: ({ signal }) => fetchCatalogItems(contentType, catalogId, extras, signal),
    enabled,
  })

export async function fetchCatalogItems(contentType: string, catalogId: string, extras: Record<string, string> = {}, signal?: AbortSignal) {
  const search = new URLSearchParams(extras)
  const suffix = search.size ? `?${search.toString()}` : ''
  const data = await apiRequest<ApiResponses<{ metas?: unknown[] }>>(`/api/catalog/${encodeURIComponent(contentType)}/${encodeURIComponent(catalogId)}${suffix}`, { signal })
  if (!data.responses.length && data.errors?.length) throw new Error('This catalog could not be loaded. Please try again.')
  return flattenMediaResponses(data, contentType)
}

export const metaQuery = (contentType: string, mediaId: string, enabled = true) =>
  queryOptions({
    queryKey: queryKeys.meta(contentType, mediaId),
    queryFn: ({ signal }) => apiRequest<ApiResponses>(`/api/meta/${encodeURIComponent(contentType)}/${encodeURIComponent(mediaId)}`, { signal }),
    enabled,
  })

export const episodesQuery = (mediaId: string, profileId: string | null) => queryOptions({
  queryKey: scopedKey(['episodes', mediaId, profileId]),
  queryFn: async ({ signal }) => episodeCatalogSchema.parse(await apiRequest<unknown>('/api/episodes/series/' + encodeURIComponent(mediaId), { signal })),
  enabled: Boolean(mediaId && profileId),
  staleTime: 60_000,
})

export const streamsQuery = (contentType: string, mediaId: string, enabled = true, addonId?: string) =>
  queryOptions({
    queryKey: [...queryKeys.streams(contentType, mediaId), ...(addonId ? [addonId] : [])],
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const data = await apiRequest<ApiResponses<{ streams?: StreamInfo[] }>>(
        `/api/streams/${encodeURIComponent(contentType)}/${encodeURIComponent(mediaId)}${addonId ? `?addon_id=${encodeURIComponent(addonId)}` : ''}`,
        { signal },
      )
      if (!data.responses.some(item => item.response.streams?.length) && data.errors?.length) throw new Error(data.errors.map(failure => failure.error).join(' '))
      return data.responses.flatMap((item) =>
        (item.response.streams ?? []).map((stream) => ({ ...stream, addon_id: item.addon_id, parsedMetadata: parseStreamMetadata(stream) })),
      )
    },
    enabled,
  })

export const watchDataQuery = (
  contentType: string,
  mediaId: string,
  enabled = true,
) =>
  queryOptions({
    queryKey: queryKeys.watchData(contentType, mediaId),
    queryFn: ({ signal }) =>
      apiRequest<WatchDataResponse>(
        `/api/watch-data/${encodeURIComponent(contentType)}/${encodeURIComponent(mediaId)}`, { signal },
      ),
    enabled,
  })

export const continueWatchingQuery = (limit = 20) =>
  queryOptions({
    queryKey: queryKeys.continueWatching(limit),
    queryFn: async ({ signal }) => {
      let data: ApiListResponse<ContinueWatchingItem>
      try {
        data = await apiRequest<ApiListResponse<ContinueWatchingItem>>(
          `/api/continue-watching?limit=${limit}`, { signal },
        )
      } catch (error) {
        // A 404 here usually means the dev frontend is pointed at a backend that has not been restarted with the viewing-state routes.
        if (error instanceof ApiError && error.status === 404) {
          return []
        }
        throw error
      }
      return data.items
    },
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 3,
  })

export const browseLayoutQuery = () => queryOptions({
  queryKey: queryKeys.browseLayout,
  queryFn: ({ signal }) => apiRequest<BrowseLayout>('/api/settings/browse-layout', { signal }),
})

export const profilesQuery = () => queryOptions({
  queryKey: queryKeys.profiles,
  queryFn: async ({ signal }) => {
    const data = await apiRequest<ApiListResponse<Profile>>('/api/profiles', { signal })
    return data.items
  },
})

export const playbackPreferencesQuery = queryOptions({
  queryKey: queryKeys.playbackPreferences,
  queryFn: () => devicePlayback(() => apiRequest<PlaybackPreferences>('/api/settings/playback')),
})

export function login(email: string, password: string) {
  return apiRequest<AuthResponse | VerificationRequired>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    token: null,
  })
}

export function register(email: string, password: string) {
  return apiRequest<AuthResponse | VerificationRequired>('/api/auth/register', {
    method: 'POST',
    body: { email, password },
    token: null,
  })
}

export function logout() {
  return apiRequest<null>('/api/auth/logout', { method: 'POST' })
}

export function createProfile(name: string, avatarKey?: string, themeColor?: string | null) {
  return apiRequest<Profile>('/api/profiles', {
    method: 'POST',
    body: {
      name,
      avatar_key: avatarKey ?? 'avatar-1',
      theme_color: themeColor ?? null,
    },
  })
}

export function updateProfile(profileId: string, name: string, avatarKey?: string, themeColor?: string | null) {
  return apiRequest<Profile>(`/api/profiles/${profileId}`, {
    method: 'PUT',
    body: {
      name,
      avatar_key: avatarKey ?? 'avatar-1',
      theme_color: themeColor ?? null,
    },
  })
}

export function deleteProfile(profileId: string) {
  return apiRequest<null>(`/api/profiles/${profileId}`, { method: 'DELETE' })
}

export function selectProfile(profileId: string) {
  return apiRequest<{ active_profile_id: string }>('/api/profiles/select', {
    method: 'POST',
    body: { profile_id: profileId },
  })
}

export function installAddon(url: string) {
  return apiRequest<AddonRecord>('/api/addons/install', {
    method: 'POST',
    body: { url },
  })
}

export function previewAddon(url: string) {
  return apiRequest<AddonPreview>('/api/addons/preview', {
    method: 'POST',
    body: { url },
  })
}

export function configureAddon(addonId: string, config: Record<string, unknown>) {
  return apiRequest<AddonRecord>(`/api/addons/${addonId}/configure`, {
    method: 'POST',
    body: config,
  })
}

export function deleteAddon(addonId: string) {
  return apiRequest<null>(`/api/addons/${addonId}`, { method: 'DELETE' })
}

export function createList(name: string, description?: string) {
  return apiRequest<UserList>('/api/lists', {
    method: 'POST',
    body: { name, description: description || null },
  })
}

export function updateList(listId: string, name: string, description?: string) {
  return apiRequest<UserList>(`/api/lists/${listId}`, {
    method: 'PUT',
    body: { name, description: description || null },
  })
}

export function deleteList(listId: string) {
  return apiRequest<null>(`/api/lists/${listId}`, { method: 'DELETE' })
}

export function addListItem(listId: string, media: MediaPreview) {
  return apiRequest<ListItem>(`/api/lists/${listId}/items`, {
    method: 'POST',
    body: {
      media_type: media.type,
      media_id: media.id,
      title: media.name,
      poster: media.poster ?? null,
      release_info: media.releaseInfo ?? null,
      meta: media.raw,
    },
  })
}

export function deleteListItem(listId: string, itemId: string) {
  return apiRequest<null>(`/api/lists/${listId}/items/${itemId}`, { method: 'DELETE' })
}

export function updateBrowseLayout(layout: BrowseLayout) {
  return apiRequest<BrowseLayout>('/api/settings/browse-layout', {
    method: 'PUT',
    body: layout,
  })
}

export function setWatchState(payload: WatchStateRequest) {
  return apiRequest<WatchState>('/api/watch-state', {
    method: 'PUT',
    body: payload,
  })
}

export function updatePlaybackPreferences(payload: PlaybackPreferences) {
  return saveDevicePlayback(payload)
}

export function findWatchState(data: WatchDataResponse | undefined, videoId: string | null) {
  return data?.items.find((item) => (item.video_id ?? null) === videoId)
}

export function defaultWatchState(mediaType: string, mediaId: string, videoId: string | null): WatchState {
  return {
    media_type: mediaType,
    media_id: mediaId,
    video_id: videoId,
    watched: false,
    position_seconds: 0,
    duration_seconds: null,
    updated_at: null,
  }
}

function flattenMediaResponses(
  data: ApiResponses<{ metas?: unknown[] }>,
  fallbackType: string,
): MediaPreview[] {
  return data.responses.flatMap((entry) =>
    (entry.response.metas ?? []).flatMap((value) => {
      if (!value || typeof value !== 'object') {
        return []
      }

      const media = value as Record<string, unknown>
      const id = stringValue(media.id)
      const name = stringValue(media.name) ?? stringValue(media.title)

      if (!id || !name) {
        return []
      }

      return {
        id,
        type: stringValue(media.type) ?? fallbackType,
        name,
        poster: stringValue(media.poster),
        background: stringValue(media.background),
        releaseInfo: stringValue(media.releaseInfo) ?? stringValue(media.year),
        description: stringValue(media.description),
        raw: media,
      }
    }),
  )
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

export type SubtitleQueryContext = {
  videoId?: string | null
  videoHash?: string | null
  videoSize?: number | null
  filename?: string | null
}


export const playerDefaultsQuery = queryOptions({
  queryKey: queryKeys.playerDefaults,
  queryFn: () => devicePlayer('wadi.device.player.v1', () => apiRequest<PlayerPreferences>('/api/settings/player-defaults')),
})

export const playerOverrideQuery = (mediaType: string, mediaId: string, enabled = true, profileId = useAppStore.getState().activeProfileId) =>
  queryOptions({
    queryKey: queryKeys.playerOverride(mediaType, mediaId, profileId),
    queryFn: () =>
      deviceOverride(deviceOverrideKey(mediaType, mediaId, profileId), () => apiRequest<PlayerOverride>(
        `/api/settings/player-override/${encodeURIComponent(mediaType)}/${encodeURIComponent(mediaId)}`,
      )),
    enabled,
  })

export const subtitlesQuery = (
  contentType: string,
  mediaId: string,
  {
    enabled = true,
    context,
  }: {
    enabled?: boolean
    context?: SubtitleQueryContext
  } = {},
) => {
  const normalizedContext = normalizeSubtitleQueryContext(context)
  return queryOptions({
    queryKey: queryKeys.subtitles(contentType, mediaId, normalizedContext),
    queryFn: async ({ signal }) => {
      const search = new URLSearchParams(normalizedContext)
      const suffix = search.size ? `?${search.toString()}` : ''
      const data = await apiRequest<ApiResponses<{ subtitles?: SubtitleInfo[] }>>(
        `/api/subtitles/${encodeURIComponent(contentType)}/${encodeURIComponent(mediaId)}${suffix}`, { signal },
      )
      return data.responses.flatMap((item) =>
        (item.response.subtitles ?? []).map((subtitle) => ({
          ...subtitle,
          addon_id: item.addon_id,
        })),
      )
    },
    enabled,
  })
}


export async function updatePlayerDefaults(payload: PlayerOverride) {
  const current = await devicePlayer('wadi.device.player.v1', () => apiRequest<PlayerPreferences>('/api/settings/player-defaults'))
  return saveDevicePlayer('wadi.device.player.v1', { ...current, ...payload })
}

function deviceOverrideKey(mediaType: string, mediaId: string, profileId: string | null) {
  return JSON.stringify(['wadi.device.override.v1', profileId, mediaType, mediaId])
}
export function updatePlayerOverride(mediaType: string, mediaId: string, payload: PlayerOverride, profileId = useAppStore.getState().activeProfileId) {
  return saveDeviceOverride(deviceOverrideKey(mediaType, mediaId, profileId), payload)
}

export function updateWatchProgress(payload: WatchProgressRequest) {
  return apiRequest<WatchState>('/api/watch-progress', {
    method: 'PUT',
    body: payload,
  })
}


function normalizeSubtitleQueryContext(context: SubtitleQueryContext | undefined): Record<string, string> {
  if (!context) {
    return {}
  }
  const normalized: Record<string, string> = {}
  const trimmedVideoId = context.videoId?.trim()
  if (trimmedVideoId) {
    normalized.videoId = trimmedVideoId
  }
  const trimmedVideoHash = context.videoHash?.trim()
  if (trimmedVideoHash) {
    normalized.videoHash = trimmedVideoHash
  }
  if (Number.isFinite(context.videoSize) && (context.videoSize ?? 0) >= 0) {
    normalized.videoSize = String(context.videoSize)
  }
  const trimmedFilename = context.filename?.trim()
  if (trimmedFilename) {
    normalized.filename = trimmedFilename
  }
  return normalized
}

export async function reorderAddons(ids: string[]) {
  return apiRequest<ApiListResponse<AddonRecord>>('/api/addons/order', { method: 'PUT', body: { ids } })
}

export function resetPlayerOverride(mediaType: string, mediaId: string, profileId = useAppStore.getState().activeProfileId) {
  return resetDeviceOverride(deviceOverrideKey(mediaType, mediaId, profileId))
}
