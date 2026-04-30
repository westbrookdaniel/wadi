import { API_BASE_URL } from '@/api/client'

export function buildStreamProxyUrl(streamUrl: string) {
  return `${API_BASE_URL}/api/stream-proxy?url=${encodeURIComponent(streamUrl)}`
}
