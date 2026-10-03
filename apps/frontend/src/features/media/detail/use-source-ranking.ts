import { useMemo } from 'react'
import { useAppStore } from '@/store/app-store'
import { useSourceHistory, reliabilityKey, seasonKey } from '@/store/source-history'
import { desktopBridge } from '@/lib/desktop'
import type { PlaybackTarget, PlayableStream } from './types'
import type { RankingContext } from './auto-pick'

export function useSourceRanking(target?: PlaybackTarget): RankingContext {
  const profile = useAppStore(state => state.activeProfileId)
  const reliability = useSourceHistory(state => state.reliability)
  const families = useSourceHistory(state => state.families)
  const choices = useSourceHistory(state => state.familyChoices)
  const choice = target ? choices[seasonKey(profile, target)] : undefined
  const family = target ? families[seasonKey(profile, target)] : null
  return useMemo(() => ({
    preferBingeGroup: choice,
    desktop: Boolean(desktopBridge()),
    bingeGroup: family,
    reliability: (stream: PlayableStream) => {
      const result = reliability[reliabilityKey(profile, stream)]
      if (!result || Date.now() - result.updatedAt > 7 * 86400000) return 0
      return Math.max(-30, Math.min(20, result.successes * 4 - result.failures * 10))
    },
  }), [family, choice, profile, reliability])
}
