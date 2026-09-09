export type PlayerStatus = 'idle' | 'loading' | 'ready' | 'error'

export type PlayerState = {
  status: PlayerStatus
  warning: string | null
  error: string | null
  duration: number
  currentTime: number
  playing: boolean
  volume: number
  muted: boolean
  hasVideo: boolean
  hasAudio: boolean
  playbackSpeed: number
  audioTracks: Array<{
    id: string
    label: string
    language: string
  }>
  selectedAudioTrackId: string | null
}

export type CastStateData = {
  paused?: boolean
  currentTime?: number
  duration?: number
  volume?: number
  muted?: boolean
  playbackSpeed?: number
  selectedAudioTrackId?: string | null
  selectedSubtitlesTrackId?: string | null
}

export type LocalPlaybackState = {
  subtitlesEnabled: boolean
  preferredSubtitleLanguage: string | null
  selectedSubtitleId: string | null
  subtitleDelay: number
  subtitleSize: number
  subtitlePosition: number
  subtitleTextColor: string
  subtitleBackgroundColor: string
  subtitleBackgroundOpacity: number
  subtitleOutlineColor: string
  subtitleOutlineStyle: string
  subtitleFontFamily: string
  subtitleOffsetX: number
  subtitleOffsetY: number
  playbackSpeed: number
  preferredAudioLanguage: string | null
  selectedAudioTrackId: string | null
}

export const initialPlayerState: PlayerState = {
  status: 'idle',
  warning: null,
  error: null,
  duration: 0,
  currentTime: 0,
  playing: false,
  volume: 0.7,
  muted: false,
  hasVideo: false,
  hasAudio: false,
  playbackSpeed: 1,
  audioTracks: [],
  selectedAudioTrackId: null,
}

export const initialLocalPlaybackState: LocalPlaybackState = {
  subtitlesEnabled: true,
  preferredSubtitleLanguage: null,
  selectedSubtitleId: null,
  subtitleDelay: 0,
  subtitleSize: 1,
  subtitlePosition: 0,
  subtitleTextColor: '#FFFFFF',
  subtitleBackgroundColor: '#000000',
  subtitleBackgroundOpacity: 0.4,
  subtitleOutlineColor: '#000000',
  subtitleOutlineStyle: 'outline',
  subtitleFontFamily: 'sans-serif',
  subtitleOffsetX: 0,
  subtitleOffsetY: 0,
  playbackSpeed: 1,
  preferredAudioLanguage: null,
  selectedAudioTrackId: null,
}
