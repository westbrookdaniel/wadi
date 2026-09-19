import { useAppStore } from '@/store/app-store'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  playerDefaultsQuery,
  playerOverrideQuery,
  queryKeys,
  updatePlayerOverride,
} from '@/api/queries'
import { normalizeLanguage } from './subtitle-utils'
import type { PlayerOverride } from '@/api/types'

import {
  initialLocalPlaybackState,
  type LocalPlaybackState,
} from './state'

export type SubtitleTrackOption = { id: string; language: string }

type HydratedPreferenceSource = {
  subtitles_enabled: boolean
  subtitle_language: string | null
  subtitle_delay_seconds: number
  subtitle_size: number
  subtitle_position: number
  subtitle_text_color: string
  subtitle_background_color: string
  subtitle_background_opacity: number
  subtitle_outline_color: string
  subtitle_outline_style: string
  subtitle_font_family: string
  subtitle_offset_x: number
  subtitle_offset_y: number
  playback_speed: number
  preferred_audio_language: string | null
  preferred_audio_track_id: string | null
}

export function usePlayerPreferences({
  mediaType,
  overrideMediaId,
  streamSubtitleList,
  streamSubtitlesLoading = false,
}: {
  mediaType: string
  overrideMediaId: string
  streamSubtitleList: SubtitleTrackOption[]
  streamSubtitlesLoading?: boolean
}) {
  const profileId = useAppStore(state => state.activeProfileId)
  const queryClient = useQueryClient()
  const playerDefaults = useQuery(playerDefaultsQuery)
  const playerOverride = useQuery(
    playerOverrideQuery(mediaType, overrideMediaId, Boolean(overrideMediaId), profileId),
  )
  const [playbackState, setPlaybackState] = useState<LocalPlaybackState>(initialLocalPlaybackState)
  const hydratedOverrideKeyRef = useRef<string | null>(null)
  const isHydratingRef = useRef(true)
  const hydrationReleaseTimerRef = useRef<number | null>(null)
  const lastPersistedOverrideRef = useRef<string | null>(null)
  const saveOverrideTimerRef = useRef<number | null>(null)

  const mergedPrefs = useMemo(() => playerDefaults.data && playerOverride.isSuccess
    ? { ...playerDefaults.data, ...(playerOverride.data ?? {}) } satisfies HydratedPreferenceSource
    : null, [playerDefaults.data, playerOverride.data, playerOverride.isSuccess])
  const overrideHydrationKey = JSON.stringify([profileId, mediaType, overrideMediaId])

  const updatePlaybackState = useCallback((patch: Partial<LocalPlaybackState>) => {
    setPlaybackState((current) => {
      const next = { ...current, ...patch }
      return isLocalPlaybackStateEqual(current, next) ? current : next
    })
  }, [])

  const overrideMutation = useMutation({
    mutationFn: (payload: PlayerOverride) => updatePlayerOverride(mediaType, overrideMediaId, payload, profileId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.playerOverride(mediaType, overrideMediaId, profileId),
      })
    },
  })

  const { mutate: mutateOverride } = overrideMutation
  const persistOverride = useCallback(
    (payload: PlayerOverride) => mutateOverride(payload),
    [mutateOverride],
  )

  useEffect(() => {
    hydratedOverrideKeyRef.current = null
    isHydratingRef.current = true
    lastPersistedOverrideRef.current = null
  }, [overrideHydrationKey])

  useEffect(() => {
    return () => {
      if (hydrationReleaseTimerRef.current !== null) {
        window.clearTimeout(hydrationReleaseTimerRef.current)
      }
      if (saveOverrideTimerRef.current !== null) {
        window.clearTimeout(saveOverrideTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!mergedPrefs || hydratedOverrideKeyRef.current === overrideHydrationKey) {
      return
    }
    if (hydrationReleaseTimerRef.current !== null) {
      window.clearTimeout(hydrationReleaseTimerRef.current)
    }
    isHydratingRef.current = true
    setPlaybackState((current) => {
      const next = hydrateLocalPlaybackState(current, mergedPrefs)
      lastPersistedOverrideRef.current = stableSerializeOverridePayload(
        buildOverridePayload(next, [], next.selectedSubtitleId),
      )
      return isLocalPlaybackStateEqual(current, next) ? current : next
    })
    hydratedOverrideKeyRef.current = overrideHydrationKey
    hydrationReleaseTimerRef.current = window.setTimeout(() => {
      isHydratingRef.current = false
      hydrationReleaseTimerRef.current = null
    }, 0)
  }, [mergedPrefs, overrideHydrationKey])

  useEffect(() => {
    const patch = resolveSubtitleSelectionState(
      playbackState,
      streamSubtitleList,
      streamSubtitlesLoading,
    )
    if (patch) {
      // Apply the preferred language after addon subtitle tracks arrive.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      updatePlaybackState(patch)
    }
  }, [
    playbackState,
    streamSubtitlesLoading,
    streamSubtitleList,
    updatePlaybackState,
  ])

  useEffect(() => {
    if (!overrideMediaId || isHydratingRef.current) {
      return
    }
    const payload = buildOverridePayload(
      playbackState,
      streamSubtitleList,
      playbackState.selectedSubtitleId,
    )
    const serialized = stableSerializeOverridePayload(payload)
    if (!shouldPersistOverride(lastPersistedOverrideRef.current, serialized)) {
      return
    }
    if (saveOverrideTimerRef.current !== null) {
      window.clearTimeout(saveOverrideTimerRef.current)
    }
    saveOverrideTimerRef.current = window.setTimeout(() => {
      lastPersistedOverrideRef.current = serialized
      persistOverride(payload)
    }, 450)
    return () => {
      if (saveOverrideTimerRef.current !== null) {
        window.clearTimeout(saveOverrideTimerRef.current)
      }
    }
  }, [overrideMediaId, overrideHydrationKey, persistOverride, playbackState, streamSubtitleList])

  return {
    playbackState,
    updatePlaybackState,
  }
}

function hydrateLocalPlaybackState(
  current: LocalPlaybackState,
  prefs: HydratedPreferenceSource,
): LocalPlaybackState {
  const languageChanged = current.preferredSubtitleLanguage !== (prefs.subtitle_language ?? null)
  return {
    subtitlesEnabled: prefs.subtitles_enabled,
    preferredSubtitleLanguage: prefs.subtitle_language ?? null,
    selectedSubtitleId: languageChanged ? null : current.selectedSubtitleId,
    subtitleDelay: prefs.subtitle_delay_seconds,
    subtitleSize: prefs.subtitle_size,
    subtitlePosition: prefs.subtitle_position,
    subtitleTextColor: prefs.subtitle_text_color,
    subtitleBackgroundColor: prefs.subtitle_background_color,
    subtitleBackgroundOpacity: prefs.subtitle_background_opacity,
    subtitleOutlineColor: prefs.subtitle_outline_color,
    subtitleOutlineStyle: prefs.subtitle_outline_style,
    subtitleFontFamily: prefs.subtitle_font_family,
    subtitleOffsetX: prefs.subtitle_offset_x,
    subtitleOffsetY: prefs.subtitle_offset_y,
    playbackSpeed: prefs.playback_speed,
    preferredAudioLanguage: prefs.preferred_audio_language ?? null,
    selectedAudioTrackId: prefs.preferred_audio_track_id ?? null,
  }
}

function selectPreferredSubtitleTrack(
  tracks: SubtitleTrackOption[],
  preferredLanguage: string | null,
  selectedSubtitleId: string | null,
) {
  if (!tracks.length) {
    return null
  }
  if (selectedSubtitleId && tracks.some((track) => track.id === selectedSubtitleId)) {
    return selectedSubtitleId
  }
  if (preferredLanguage) {
    const preferred = tracks.find((track) => normalizeLanguage(track.language) === normalizeLanguage(preferredLanguage))
    if (preferred) {
      return preferred.id
    }
  }
  return tracks[0]?.id ?? null
}

export function resolveSubtitleSelectionState(
  playbackState: Pick<LocalPlaybackState, 'selectedSubtitleId' | 'subtitlesEnabled' | 'preferredSubtitleLanguage'>,
  tracks: SubtitleTrackOption[],
  streamSubtitlesLoading: boolean,
): Partial<LocalPlaybackState> | null {
  if (streamSubtitlesLoading) {
    return null
  }
  if (!tracks.length) {
    return { selectedSubtitleId: null, subtitlesEnabled: false }
  }
  if (!playbackState.subtitlesEnabled) {
    if (playbackState.selectedSubtitleId !== null) {
      return { selectedSubtitleId: null }
    }
    return null
  }
  const nextSubtitleId = selectPreferredSubtitleTrack(
    tracks,
    playbackState.preferredSubtitleLanguage,
    playbackState.selectedSubtitleId,
  )
  if (nextSubtitleId !== playbackState.selectedSubtitleId) {
    return { selectedSubtitleId: nextSubtitleId }
  }
  return null
}

function buildOverridePayload(
  state: LocalPlaybackState,
  subtitleTracks: SubtitleTrackOption[],
  selectedSubtitleId: string | null,
): PlayerOverride {
  const subtitlesEnabled = selectedSubtitleId !== null
  const selectedSubtitleLanguage =
    subtitlesEnabled
      ? (
        subtitleTracks.find((track) => track.id === selectedSubtitleId)?.language
        ?? state.preferredSubtitleLanguage
        ?? null
      )
      : null
  return {
    subtitles_enabled: subtitlesEnabled,
    subtitle_language: selectedSubtitleLanguage,
    subtitle_delay_seconds: state.subtitleDelay,
    subtitle_size: state.subtitleSize,
    subtitle_position: state.subtitlePosition,
    subtitle_text_color: state.subtitleTextColor,
    subtitle_background_color: state.subtitleBackgroundColor,
    subtitle_background_opacity: state.subtitleBackgroundOpacity,
    subtitle_outline_color: state.subtitleOutlineColor,
    subtitle_outline_style: state.subtitleOutlineStyle,
    subtitle_font_family: state.subtitleFontFamily,
    subtitle_offset_x: state.subtitleOffsetX,
    subtitle_offset_y: state.subtitleOffsetY,
    playback_speed: state.playbackSpeed,
    preferred_audio_language: state.preferredAudioLanguage,
    preferred_audio_track_id: state.selectedAudioTrackId,
  }
}

function stableSerializeOverridePayload<T>(payload: T) {
  return JSON.stringify(payload)
}

function shouldPersistOverride(previousSerialized: string | null, nextSerialized: string) {
  return previousSerialized !== nextSerialized
}

function isLocalPlaybackStateEqual(left: LocalPlaybackState, right: LocalPlaybackState) {
  return stableSerializeOverridePayload(left) === stableSerializeOverridePayload(right)
}
