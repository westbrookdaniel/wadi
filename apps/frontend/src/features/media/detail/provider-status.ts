import { parseStreamMetadata } from './stream-metadata'

export function cacheStatus(stream: unknown): 'uncached' | 'cached' | null {
  const raw = parseStreamMetadata(stream).raw
  const text = Object.values(raw).filter(Boolean).join(' ')
  if (/not cached|uncached|\[(?:TB|RD|AD|PM)\s*⬇/i.test(text)) return 'uncached'
  if (/⚡|cached/i.test(text)) return 'cached'
  return null
}

export function placeholderReason(stream: unknown, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 30) return null
  const advertisedSize = parseStreamMetadata(stream).sizeBytes.value
  if (cacheStatus(stream) !== 'uncached' && !(advertisedSize && advertisedSize >= 50_000_000)) return null
  return 'This source returned a short provider notice instead of the video. It is likely not cached yet on the debrid service. Try a cached source.'
}
