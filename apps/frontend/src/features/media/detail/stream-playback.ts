import { API_BASE_URL } from '@/api/client'

export function buildStreamProxyUrl(streamUrl: string) {
  return `${API_BASE_URL}/api/stream-proxy?url=${encodeURIComponent(streamUrl)}`
}

export function buildSubtitleProxyUrl(subtitleUrl: string) {
  return `${API_BASE_URL}/api/subtitle-proxy?url=${encodeURIComponent(subtitleUrl)}`
}
