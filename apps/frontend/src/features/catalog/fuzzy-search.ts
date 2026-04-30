import fuzzysort from 'fuzzysort'

import type { MediaPreview } from '@/api/types'

export type RankedMedia = {
  item: MediaPreview
  score: number
  isPrefix: boolean
  hasMatch: boolean
}

const NAME_WEIGHT = 0.7
const RELEASE_WEIGHT = 0.2
const ID_WEIGHT = 0.1
const NO_MATCH_SCORE = -100_000

export function rankMediaByQuery(media: MediaPreview[], rawQuery: string): RankedMedia[] {
  const query = normalizeForSearch(rawQuery)
  if (!query) {
    return media.map((item) => ({ item, score: 0, isPrefix: false, hasMatch: true }))
  }

  const ranked = media.map((item) => {
    const name = normalizeForSearch(item.name)
    const releaseInfo = normalizeForSearch(item.releaseInfo ?? '')
    const id = normalizeForSearch(item.id)

    const candidates = [
      { score: fuzzyScore(query, name), weight: NAME_WEIGHT, enabled: Boolean(name) },
      { score: fuzzyScore(query, releaseInfo), weight: RELEASE_WEIGHT, enabled: Boolean(releaseInfo) },
      { score: fuzzyScore(query, id), weight: ID_WEIGHT, enabled: Boolean(id) },
    ].filter((candidate) => candidate.enabled)

    const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0)
    const weightedScore =
      totalWeight > 0
        ? candidates.reduce((sum, candidate) => sum + candidate.score * candidate.weight, 0) / totalWeight
        : NO_MATCH_SCORE

    return {
      item,
      score: weightedScore,
      isPrefix: name.startsWith(query),
      hasMatch: weightedScore > NO_MATCH_SCORE,
    }
  })

  ranked.sort((a, b) => {
    if (a.hasMatch !== b.hasMatch) return a.hasMatch ? -1 : 1
    if (a.isPrefix !== b.isPrefix) return a.isPrefix ? -1 : 1
    if (a.score !== b.score) return b.score - a.score
    const nameOrder = a.item.name.localeCompare(b.item.name)
    if (nameOrder !== 0) return nameOrder
    return a.item.id.localeCompare(b.item.id)
  })

  return ranked
}

function fuzzyScore(query: string, target: string): number {
  if (!query || !target) return NO_MATCH_SCORE
  const result = fuzzysort.single(query, target)
  return result ? result.score : NO_MATCH_SCORE
}

export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
