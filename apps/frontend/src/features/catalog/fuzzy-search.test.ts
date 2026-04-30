import type { MediaPreview } from '@/api/types'

import { rankMediaByQuery } from './fuzzy-search'

const item = (id: string, name: string, releaseInfo?: string): MediaPreview => ({
  id,
  type: 'movie',
  name,
  releaseInfo,
  raw: {},
})

describe('rankMediaByQuery', () => {
  it('matches typo queries', () => {
    const ranked = rankMediaByQuery(
      [item('1', 'Interstellar'), item('2', 'Inception')],
      'interstllr',
    )

    expect(ranked[0]?.item.name).toBe('Interstellar')
  })

  it('matches partial token queries', () => {
    const ranked = rankMediaByQuery(
      [item('1', 'Game of Thrones'), item('2', 'The Last of Us')],
      'game thr',
    )

    expect(ranked[0]?.item.name).toBe('Game of Thrones')
  })

  it('prefers exact/prefix over weaker fuzzy matches', () => {
    const ranked = rankMediaByQuery(
      [item('1', 'Dune'), item('2', 'The Dunes of Arrakis')],
      'dune',
    )

    expect(ranked[0]?.item.name).toBe('Dune')
  })

  it('keeps low-relevance results and pushes them to the end', () => {
    const ranked = rankMediaByQuery(
      [item('1', 'Interstellar'), item('2', 'Zoolander')],
      'interstllr',
    )

    expect(ranked).toHaveLength(2)
    expect(ranked[0]?.item.name).toBe('Interstellar')
    expect(ranked[1]?.item.name).toBe('Zoolander')
  })

  it('uses deterministic ordering for equal scores', () => {
    const ranked = rankMediaByQuery(
      [item('2', 'Alpha'), item('1', 'Alpha')],
      'alpha',
    )

    expect(ranked.map((entry) => entry.item.id)).toEqual(['1', '2'])
  })
})
