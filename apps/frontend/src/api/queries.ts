import { queryOptions } from '@tanstack/react-query'

import { ApiError, apiRequest } from '@/api/client'
import type {
  AddonRecord,
  AddonPreview,
  ApiListResponse,
  ApiResponses,
  AuthResponse,
  BrowseLayout,
  CatalogEntry,
  ContinueWatchingItem,
  ListItem,
  MediaPreview,
  PlayerOverride,
  PlayerPreferences,
  Profile,
  StreamInfo,
  SubtitleInfo,
  User,
  UserList,
  WatchDataResponse,
  WatchProgressRequest,
  WatchState,
  WatchStateRequest,
} from '@/api/types'

export type SubtitleQueryContext = {
  videoId?: string | null
  videoHash?: string | null
  videoSize?: number | null
  filename?: string | null
}

export const queryKeys = {
  me: ['me'] as const,
  addons: ['addons'] as const,
  catalogs: ['catalogs'] as const,
  catalog: (type: string, id: string, extras: Record<string, string> = {}) =>
    ['catalog', type, id, extras] as const,
  lists: ['lists'] as const,
  listItems: (listId: string | null) => ['list-items', listId] as const,
  meta: (type: string, id: string) => ['meta', type, id] as const,
  streams: (type: string, id: string) => ['streams', type, id] as const,
  subtitles: (type: string, id: string, context: Record<string, string> = {}) =>
    ['subtitles', type, id, context] as const,
  watchData: (type: string, id: string) => ['watch-data', type, id] as const,
  continueWatching: (limit = 20) => ['continue-watching', limit] as const,
  browseLayout: ['browse-layout'] as const,
  profiles: ['profiles'] as const,
  playerDefaults: ['player-defaults'] as const,
  playerOverride: (mediaType: string, mediaId: string) => ['player-override', mediaType, mediaId] as const,
}

export const meQuery = (enabled: boolean) =>
  queryOptions({
    queryKey: queryKeys.me,
    queryFn: () => apiRequest<User>('/api/auth/me'),
    enabled,
    retry: false,
  })

export const addonsQuery = queryOptions({
  queryKey: queryKeys.addons,
  queryFn: async () => {
    const data = await apiRequest<ApiListResponse<AddonRecord>>('/api/addons')
    return data.items
  },
})

export const catalogsQuery = queryOptions({
  queryKey: queryKeys.catalogs,
  queryFn: async () => {
    const data = await apiRequest<ApiListResponse<CatalogEntry>>('/api/catalogs')
    return data.items
  },
})

export const listsQuery = queryOptions({
  queryKey: queryKeys.lists,
  queryFn: async () => {
    const data = await apiRequest<ApiListResponse<UserList>>('/api/lists')
    return data.items
  },
})

export const listItemsQuery = (listId: string | null) =>
  queryOptions({
    queryKey: queryKeys.listItems(listId),
    queryFn: async () => {
      const data = await apiRequest<ApiListResponse<ListItem>>(`/api/lists/${listId}/items`)
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
    queryFn: async () => {
      const search = new URLSearchParams(extras)
      const suffix = search.size ? `?${search.toString()}` : ''
      const data = await apiRequest<ApiResponses<{ metas?: unknown[] }>>(
        `/api/catalog/${contentType}/${catalogId}${suffix}`,
      )
      return flattenMediaResponses(data, contentType)
    },
    enabled,
  })

export const metaQuery = (contentType: string, mediaId: string, enabled = true) =>
  queryOptions({
    queryKey: queryKeys.meta(contentType, mediaId),
    queryFn: () => apiRequest<ApiResponses>(`/api/meta/${contentType}/${mediaId}`),
    enabled,
  })

export const streamsQuery = (contentType: string, mediaId: string, enabled = true) =>
  queryOptions({
    queryKey: queryKeys.streams(contentType, mediaId),
    queryFn: async () => {
      const data = await apiRequest<ApiResponses<{ streams?: StreamInfo[] }>>(
        `/api/streams/${contentType}/${mediaId}`,
      )
      return data.responses.flatMap((item) =>
        (item.response.streams ?? []).map((stream) => ({ ...stream, addon_id: item.addon_id })),
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
    queryFn: () =>
      apiRequest<WatchDataResponse>(
        `/api/watch-data/${encodeURIComponent(contentType)}/${encodeURIComponent(mediaId)}`,
      ),
    enabled,
  })

export const continueWatchingQuery = (limit = 20) =>
  queryOptions({
    queryKey: queryKeys.continueWatching(limit),
    queryFn: async () => {
      let data: ApiListResponse<ContinueWatchingItem>
      try {
        data = await apiRequest<ApiListResponse<ContinueWatchingItem>>(
          `/api/continue-watching?limit=${limit}`,
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

export const browseLayoutQuery = queryOptions({
  queryKey: queryKeys.browseLayout,
  queryFn: () => apiRequest<BrowseLayout>('/api/settings/browse-layout'),
})

export const profilesQuery = queryOptions({
  queryKey: queryKeys.profiles,
  queryFn: async () => {
    const data = await apiRequest<ApiListResponse<Profile>>('/api/profiles')
    return data.items
  },
})

export const playerDefaultsQuery = queryOptions({
  queryKey: queryKeys.playerDefaults,
  queryFn: () => apiRequest<PlayerPreferences>('/api/settings/player-defaults'),
})

export const playerOverrideQuery = (mediaType: string, mediaId: string, enabled = true) =>
  queryOptions({
    queryKey: queryKeys.playerOverride(mediaType, mediaId),
    queryFn: () =>
      apiRequest<PlayerOverride>(
        `/api/settings/player-override/${encodeURIComponent(mediaType)}/${encodeURIComponent(mediaId)}`,
      ),
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
    queryFn: async () => {
      const search = new URLSearchParams(normalizedContext)
      const suffix = search.size ? `?${search.toString()}` : ''
      const data = await apiRequest<ApiResponses<{ subtitles?: SubtitleInfo[] }>>(
        `/api/subtitles/${encodeURIComponent(contentType)}/${encodeURIComponent(mediaId)}${suffix}`,
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

export function login(email: string, password: string) {
  return apiRequest<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    token: null,
  })
}

export function register(email: string, password: string) {
  return apiRequest<AuthResponse>('/api/auth/register', {
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

export function updatePlayerDefaults(payload: PlayerOverride) {
  return apiRequest<PlayerPreferences>('/api/settings/player-defaults', {
    method: 'PUT',
    body: payload,
  })
}

export function updatePlayerOverride(mediaType: string, mediaId: string, payload: PlayerOverride) {
  return apiRequest<PlayerOverride>(
    `/api/settings/player-override/${encodeURIComponent(mediaType)}/${encodeURIComponent(mediaId)}`,
    {
      method: 'PUT',
      body: payload,
    },
  )
}

export function updateWatchProgress(payload: WatchProgressRequest) {
  return apiRequest<WatchState>('/api/watch-progress', {
    method: 'PUT',
    body: payload,
  })
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
