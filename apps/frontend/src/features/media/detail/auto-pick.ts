import { z } from 'zod'
import type { AutoPlaybackSettings } from '@/store/auto-playback'
import type { PlayableStream, Episode } from './types'
import { parseStreamMetadata } from './stream-metadata'

export function isDirectStream(stream: PlayableStream) {
  try { return ['http:', 'https:'].includes(new URL(stream.url ?? '').protocol) } catch { return false }
}
export function rankStreams(streams: PlayableStream[], settings: AutoPlaybackSettings) {
  return streams.map((stream, index) => {
    const metadata = parseStreamMetadata(stream)
    const resolution = metadata.resolution.value
    const size = metadata.sizeBytes.value
    const raw = Object.values(metadata.raw).filter(Boolean).join(' ').toLowerCase()
    const excluded = settings.excludedWords.split(',').map(word => word.trim().toLowerCase()).filter(Boolean)
    const eligible = isDirectStream(stream)
      && (resolution === null ? settings.allowUnknown : resolution <= settings.maxResolution)
      && (!settings.maxSizeGB || (size === null ? settings.allowUnknown : size <= settings.maxSizeGB * 1e9))
      && (settings.allowHdr || metadata.hdr.value === 'SDR' || metadata.hdr.value === null && settings.allowUnknown)
      && (!settings.excludeCam || metadata.sourceQuality.value !== 'CAM')
      && !excluded.some(word => raw.includes(word))
    let score = 0
    const reasons: string[] = []
    if (resolution !== null) {
      score += settings.qualityWeight * Math.max(0, 1 - Math.abs(resolution - settings.preferredResolution) / 2160)
      reasons.push(`${resolution}p`)
    }
    if (size !== null) {
      score += settings.sizeWeight / (1 + size / 1e9)
      reasons.push(`${(size / 1e9).toFixed(1)} GB`)
    }
    if (settings.codec !== 'any' && metadata.codec.value === settings.codec) { score += 25; reasons.push(settings.codec) }
    if (settings.language !== 'any' && metadata.languages.value?.some(lang => normalizeLanguage(lang) === settings.language || lang.startsWith(settings.language + '-'))) { score += 35; reasons.push('Preferred language') }
    if (settings.preferredAddon && stream.addon_id === settings.preferredAddon) { score += 40; reasons.push('Preferred provider') }
    return { stream, index, score, eligible, reasons }
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.index - b.index)
}

export function nextReleasedEpisode(episodes: Episode[], currentId: string | null, now = Date.now()) {
  const ordered = episodes.filter(episode => episode.season !== null && episode.season > 0 && episode.episode !== null)
    .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0))
  const currentIndex = ordered.findIndex(episode => episode.id === currentId || Boolean(currentId && episode.videoIds?.includes(currentId)))
  if (currentIndex < 0) return null
  const next = ordered[currentIndex + 1]
  if (!next || next.releaseConflicting || !next.released) return null
  if (!z.iso.date().safeParse(next.released).success && !z.iso.datetime({ offset: true }).safeParse(next.released).success) return null
  const timestamp = Date.parse(next.released)
  const releasedAt = timestamp + (/^\d{4}-\d{2}-\d{2}$/.test(next.released) ? 86400000 : 0)
  return Number.isFinite(releasedAt) && releasedAt <= now ? next : null
}

function normalizeLanguage(language: string) {
  const aliases: Record<string, string> = { eng: 'en', spa: 'es', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de', jpn: 'ja', hin: 'hi', ita: 'it' }
  return aliases[language] ?? language
}
