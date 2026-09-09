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

  it('disables subtitles when no tracks exist after loading', () => {
    const patch = resolveSubtitleSelectionState(
      {
        selectedSubtitleId: 'eng',
        subtitlesEnabled: true,
        preferredSubtitleLanguage: 'eng',
      },
      [],
      false,
    )
    expect(patch).toEqual({ selectedSubtitleId: null, subtitlesEnabled: false })
  })
})
