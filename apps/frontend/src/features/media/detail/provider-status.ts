import { parseStreamMetadata } from './stream-metadata'

export function placeholderReason(stream: unknown, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 30) return null
  const advertisedSize = parseStreamMetadata(stream).sizeBytes.value
  const text = Object.values(parseStreamMetadata(stream).raw).filter(Boolean).join(' ')
  const uncachedNotice = /not cached|uncached|\[(?:TB|RD|AD|PM)\s*⬇/i.test(text)
  if (!uncachedNotice && !(advertisedSize && advertisedSize >= 50_000_000)) return null
  return 'This source returned a short provider notice instead of the video. It is likely not cached yet on the debrid service. Try a cached source.'
}
