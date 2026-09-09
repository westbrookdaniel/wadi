import fuzzysort from 'fuzzysort'
import type { MediaPreview } from '@/api/types'

export type RankedMedia = { item: MediaPreview; score: number; isPrefix: boolean; hasMatch: boolean }

// Rank titles independently of optional year/id fields. Missing metadata must
// never bury a good title match. Keep provider results even when relevance is low.
export function rankMediaByQuery(media: MediaPreview[], rawQuery: string): RankedMedia[] {
  const query = normalizeForSearch(rawQuery).slice(0, 120)
  const unique = [...new Map(media.map(item => [`${item.type}:${item.id}`, item])).values()]
  const ranked = unique.map(item => {
    const name = normalizeForSearch(item.name.slice(0, 512))
    const tokens = name.split(' ')
    const words = query.split(' ').filter(Boolean)
    const tokenScore = words.length ? words.reduce((sum, word) => sum + Math.max(0, ...tokens.map(token => {
      if (token === word) return 100
      if (token.startsWith(word)) return 90
      if (word.length < 4) return 0
      const distance = editDistance(word, token.slice(0, 120))
      return distance <= Math.max(1, Math.floor(word.length / 3)) ? 80 * (1 - distance / Math.max(word.length, token.length)) - Math.abs(word.length - token.length) * 3 + commonPrefix(word, token) * 2 : 0
    })), 0) / words.length : 0
    const fuzzy = query ? fuzzysort.single(query, name)?.score ?? 0 : 0
    const score = !query ? 0 : name === query ? 400 : name.startsWith(query) ? 300 : name.includes(query) ? 200 : Math.max(tokenScore, fuzzy * 55)
    return { item, score, isPrefix: Boolean(query) && name.startsWith(query), hasMatch: !query || score > 0 }
  })
  return ranked.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name) || a.item.id.localeCompare(b.item.id))
}

function commonPrefix(a: string, b: string) {
  let length = 0
  while (length < Math.min(a.length, b.length) && a[length] === b[length]) length++
  return length
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min((current[j - 1] ?? 0) + 1, (previous[j] ?? 0) + 1, (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return previous[b.length] ?? a.length
}

export function normalizeForSearch(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
}
