import { queryOptions } from '@tanstack/react-query'

import { apiRequest } from '@/api/client'
import type {
  AddonRecord,
  ApiListResponse,
  ApiResponses,
  AuthResponse,
  CatalogEntry,
  ListItem,
  MediaPreview,
  StreamInfo,
  SubtitleInfo,
  User,
  UserList,
} from '@/api/types'

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
  subtitles: (type: string, id: string) => ['subtitles', type, id] as const,
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

export const subtitlesQuery = (contentType: string, mediaId: string, enabled = true) =>
  queryOptions({
    queryKey: queryKeys.subtitles(contentType, mediaId),
    queryFn: async () => {
      const data = await apiRequest<ApiResponses<{ subtitles?: SubtitleInfo[] }>>(
        `/api/subtitles/${contentType}/${mediaId}`,
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

export function installAddon(url: string) {
  return apiRequest<AddonRecord>('/api/addons/install', {
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
