import type { SubtitleInfo } from '@/api/types'

export type SubtitleTrackWithSource = SubtitleInfo & {
  source?: string
}

export type NormalizedSubtitleTrack = {
  id: string
  language: string
  url: string
  source: string
}

export type SubtitleCue = {
  start: number
  end: number
  text: string
}

export function mergeSubtitleTracks(
  streamSubtitles: SubtitleInfo[] | undefined,
  streamSource: string,
  resourceSubtitles: SubtitleTrackWithSource[] | undefined,
): NormalizedSubtitleTrack[] {
  const merged = new Map<string, NormalizedSubtitleTrack>()
  for (const track of normalizeSubtitleTracks(streamSubtitles, streamSource)) {
    merged.set(track.id, track)
  }
  for (const track of normalizeSubtitleTracks(resourceSubtitles, 'subtitles')) {
    if (!merged.has(track.id)) {
      merged.set(track.id, track)
    }
  }
  return Array.from(merged.values())
}

export function parseSubtitleText(text: string): SubtitleCue[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/^\uFEFF/, '')
  if (/^WEBVTT(?:\s|$)/.test(normalized)) {
    return parseVtt(normalized)
  }
  return parseSrt(normalized)
}

export function parseSrt(text: string): SubtitleCue[] {
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .flatMap((block) => {
      const lines = block.split('\n')
      const timing = lines.find((line) => line.includes('-->'))
      if (!timing) {
        return []
      }
      const [startRaw, endRaw] = timing.split('-->').map((value) => value.trim())
      const start = parseTimestamp(startRaw)
      const end = parseTimestamp(endRaw)
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return []
      }
      const cueText = lines.slice(lines.indexOf(timing) + 1).join('\n').trim()
      if (!cueText) {
        return []
      }
      return [{ start, end, text: cueText }]
    })
}

export function parseVtt(text: string): SubtitleCue[] {
  return text
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter((block) => block.includes('-->'))
    .flatMap((block) => {
      const lines = block.split('\n')
      const timing = lines.find((line) => line.includes('-->'))
      if (!timing) {
        return []
      }
      const [startRaw, endRawWithSettings] = timing.split('-->').map((value) => value.trim())
      const endRaw = endRawWithSettings.split(/\s+/)[0] ?? endRawWithSettings
      const start = parseTimestamp(startRaw)
      const end = parseTimestamp(endRaw)
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return []
      }
      const cueText = lines.slice(lines.indexOf(timing) + 1).join('\n').trim()
      if (!cueText) {
        return []
      }
      return [{ start, end, text: cueText }]
    })
}

function normalizeSubtitleTracks(
  subtitles: SubtitleTrackWithSource[] | SubtitleInfo[] | undefined,
  fallbackSource: string,
): NormalizedSubtitleTrack[] {
  if (!subtitles?.length) {
    return []
  }
  const dedupe = new Map<string, NormalizedSubtitleTrack>()
  for (const track of subtitles) {
    const url = typeof track.url === 'string' ? track.url.trim() : ''
    if (!url) {
      continue
    }
    const language = typeof track.lang === 'string' && track.lang.trim() ? track.lang.trim() : 'und'
    const source = typeof (track as SubtitleTrackWithSource).source === 'string' && (track as SubtitleTrackWithSource).source
      ? (track as SubtitleTrackWithSource).source as string
      : fallbackSource
    const identity = subtitleIdentity(track, source, language, url)
    if (!dedupe.has(identity.dedupeKey)) {
      dedupe.set(identity.dedupeKey, { id: identity.id, language, source, url })
    }
  }
  return Array.from(dedupe.values())
}

function subtitleIdentity(track: SubtitleInfo, source: string, language: string, url: string) {
  const rawId = typeof track.id === 'string' ? track.id.trim() : ''
  if (rawId) {
    return {
      id: rawId,
      dedupeKey: `id:${rawId}`,
    }
  }
  const fallbackId = `auto:${source}:${language}:${url}`
  return {
    id: fallbackId,
    dedupeKey: fallbackId,
  }
}

function parseTimestamp(value: string) {
  const normalized = value.replace(',', '.')
  const parts = normalized.split(':')
  if (parts.length < 2 || parts.length > 3) {
    return NaN
  }
  const secondsWithMs = Number(parts[parts.length - 1])
  const minutes = Number(parts[parts.length - 2])
  const hours = parts.length === 3 ? Number(parts[0]) : 0
  if (![hours, minutes, secondsWithMs].every(Number.isFinite)) {
    return NaN
  }
  return hours * 3600 + minutes * 60 + secondsWithMs
}
