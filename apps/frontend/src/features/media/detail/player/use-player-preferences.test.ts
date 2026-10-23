import { describe, expect, it } from 'vitest'

import { resolveSubtitleSelectionState } from './use-player-preferences'

describe('resolveSubtitleSelectionState', () => {
  it('does not disable subtitles while subtitle tracks are still loading', () => {
    const patch = resolveSubtitleSelectionState(
      {
        selectedSubtitleId: null,
        subtitlesEnabled: true,
        preferredSubtitleLanguage: 'eng',
      },
      [],
      true,
    )
    expect(patch).toBeNull()
  })

  it('clears unavailable tracks without disabling the subtitle preference', () => {
    const patch = resolveSubtitleSelectionState(
      {
        selectedSubtitleId: 'eng',
        subtitlesEnabled: true,
        preferredSubtitleLanguage: 'eng',
      },
      [],
      false,
    )
    expect(patch).toEqual({ selectedSubtitleId: null })
  })
})

it('keeps subtitle intent after a trackless source so a later source can select the preferred language', () => {
  const intent = { selectedSubtitleId: 'eng', subtitlesEnabled: true, preferredSubtitleLanguage: 'eng' }
  const patch = resolveSubtitleSelectionState(intent, [], false)
  expect(patch).toEqual({ selectedSubtitleId: null })
  expect(resolveSubtitleSelectionState({ ...intent, ...patch }, [{ id: 'next-eng', language: 'eng' }], false)).toEqual({ selectedSubtitleId: 'next-eng' })
})
