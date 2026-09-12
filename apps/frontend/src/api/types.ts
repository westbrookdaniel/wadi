export type Page = 'home' | 'search' | 'watchlists' | 'movies' | 'series' | 'settings'

export type User = {
  id: string
  email: string
  active_profile_id: string
  created_at?: string
}

export type VerificationRequired = { verification_required: true; challenge: string; email: string }

export type AuthResponse = {
  token: string
  user: User
  active_profile_id: string
}

export type Profile = {
  id: string
  user_id: string
  name: string
  avatar_key: string
  theme_color: string | null
  created_at: string
  updated_at: string
}

export type ApiListResponse<T> = {
  items: T[]
}

export type ApiResponses<T = unknown> = {
  errors?: Array<{ addon_id: string; error: string }>
  responses: Array<{
    addon_id: string
    response: T
  }>
}

export type AddonRecord = {
  id: string
  source_url: string
  transport: string
  manifest: AddonManifest
  config: Record<string, unknown> | null
  installed_at: string
  updated_at: string
}

export type AddonPreview = {
  source_url: string
  transport: string
  manifest: AddonManifest
  favicon_url: string | null
  installed_addon_id: string | null
}

export type AddonManifest = {
  id?: string
  name?: string
  version?: string
  description?: string
  resources?: unknown[]
  types?: string[]
  catalogs?: CatalogDecl[]
  config?: ConfigDecl[]
  [key: string]: unknown
}

export type CatalogDecl = {
  type: string
  id: string
  name?: string
  extra?: CatalogExtraDecl[]
  [key: string]: unknown
}

export type CatalogExtraDecl = {
  name: string
  isRequired?: boolean
  options?: string[]
  optionsLimit?: number
}

export type CatalogEntry = {
  addon_id: string
  addon_name: string
  catalog: CatalogDecl
}

export type ConfigDecl = {
  key: string
  type: string
  default?: unknown
  title?: string
  options?: string[]
  required?: boolean
}

export type UserList = {
  id: string
  name: string
  is_default: boolean
  description: string | null
  created_at: string
  updated_at: string
}

export type ListItem = {
  id: string
  list_id: string
  addon_id: string | null
  media_type: string
  media_id: string
  video_id: string | null
  title: string
  poster: string | null
  release_info: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

export type MediaPreview = {
  background?: string
  id: string
  type: string
  name: string
  poster?: string
  releaseInfo?: string
  description?: string
  raw: Record<string, unknown>
}

export type WatchState = {
  media_type: string
  media_id: string
  video_id: string | null
  watched: boolean
  position_seconds: number
  duration_seconds: number | null
  updated_at: string | null
}

export type ContinueWatchingItem = WatchState

export type WatchDataResponse = {
  media_type: string
  media_id: string
  items: WatchState[]
}

export type WatchStateRequest = {
  media_type: string
  media_id: string
  video_id?: string | null
  watched: boolean
}

export type StreamInfo = {
  title?: string
  name?: string
  url?: string
  externalUrl?: string
  infoHash?: string
  fileIdx?: number
  subtitles?: SubtitleInfo[]
  behaviorHints?: {
    videoHash?: string
    videoSize?: number
    filename?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type SubtitleInfo = {
  id?: string
  lang?: string
  url?: string
  [key: string]: unknown
}

export type BrowseLayoutPage = {
  catalogModes?: Record<string, "combined" | "movie" | "series">
  order: string[]
  hidden: string[]
}

export type BrowseLayout = {
  pages: { home: BrowseLayoutPage }
}

export type PlaybackAction = 'internal' | 'external' | 'copy'

export type PlaybackPreferences = {
  stream_action: PlaybackAction
  external_player_preset?: string
  external_player_template: string
}


export type WatchProgressRequest = {
  media_type: string
  media_id: string
  video_id?: string | null
  position_seconds: number
  duration_seconds?: number | null
}

export type PlayerPreferences = {
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

export type PlayerOverride = Partial<PlayerPreferences>
