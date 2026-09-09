import { API_BASE_URL } from '@/api/client'
import type { PlaybackAction, PlaybackPreferences, StreamInfo } from '@/api/types'

export const DEFAULT_EXTERNAL_PLAYER_TEMPLATE = 'vlc://{url}'

export function getStreamUrl(
  stream: Pick<StreamInfo, 'url' | 'externalUrl' | 'infoHash'>,
): string | null {
  const directUrl = normalizeUrl(stream.url)
  if (directUrl) {
    return directUrl
  }

  const externalUrl = normalizeUrl(stream.externalUrl)
  if (externalUrl) {
    return externalUrl
  }

  const infoHash = normalizeUrl(stream.infoHash)
  return infoHash ? `magnet:?xt=urn:btih:${encodeURIComponent(infoHash)}` : null
}

export function buildExternalPlayerUrl(
  streamUrl: string,
  template = DEFAULT_EXTERNAL_PLAYER_TEMPLATE,
) {
  const normalizedTemplate = template.trim()
  const scheme = normalizedTemplate.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase()
  if (
    !normalizedTemplate ||
    !normalizedTemplate.includes('{url}') ||
    !scheme ||
    ['data', 'javascript', 'vbscript'].includes(scheme)
  ) {
    return null
  }

  return normalizedTemplate.replaceAll('{url}', encodeURIComponent(streamUrl))
}

export function normalizePlaybackPreferences(
  preferences?: Partial<PlaybackPreferences> | null,
): PlaybackPreferences {
  const streamAction: PlaybackAction =
    preferences?.stream_action === 'external' ? 'external' : 'copy'
  const externalPlayerTemplate =
    typeof preferences?.external_player_template === 'string'
      ? preferences.external_player_template
      : DEFAULT_EXTERNAL_PLAYER_TEMPLATE

  return {
    stream_action: streamAction,
    external_player_template: externalPlayerTemplate,
  }
}

function normalizeUrl(value: string | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export function buildStreamProxyUrl(url: string) { return `${API_BASE_URL}/api/stream-proxy?url=${encodeURIComponent(url)}` }
export function buildSubtitleProxyUrl(url: string) { return `${API_BASE_URL}/api/subtitle-proxy?url=${encodeURIComponent(url)}` }
