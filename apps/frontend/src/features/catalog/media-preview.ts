import type { ContinueWatchingItem, MediaPreview } from '@/api/types'

export function mediaPreviewFromMeta(
  item: ContinueWatchingItem,
  data: unknown,
): MediaPreview | null {
  const responses =
    data &&
    typeof data === 'object' &&
    'responses' in data &&
    Array.isArray(data.responses)
      ? data.responses
      : []

  for (const response of responses) {
    if (!response || typeof response !== 'object') {
      continue
    }

    const body = 'response' in response ? response.response : null
    const meta =
      body &&
      typeof body === 'object' &&
      'meta' in body &&
      body.meta &&
      typeof body.meta === 'object'
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
      id: stringValue(meta.id) ?? item.media_id,
      type: stringValue(meta.type) ?? item.media_type,
      name,
      poster: stringValue(meta.poster),
      background: stringValue(meta.background),
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
