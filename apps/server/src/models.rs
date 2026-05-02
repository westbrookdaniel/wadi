use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub avatar_key: String,
    pub theme_color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    pub profile_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
    pub active_profile_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddonRecord {
    pub id: String,
    pub source_url: String,
    pub transport: String,
    pub manifest: Value,
    pub config: Option<Value>,
    pub installed_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddonPreview {
    pub source_url: String,
    pub transport: String,
    pub manifest: Value,
    pub favicon_url: Option<String>,
    pub installed_addon_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserList {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListItem {
    pub id: String,
    pub list_id: String,
    pub addon_id: Option<String>,
    pub media_type: String,
    pub media_id: String,
    pub video_id: Option<String>,
    pub title: String,
    pub poster: Option<String>,
    pub release_info: Option<String>,
    pub meta: Option<Value>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchState {
    pub media_type: String,
    pub media_id: String,
    pub video_id: Option<String>,
    pub watched: bool,
    pub position_seconds: i64,
    pub duration_seconds: Option<i64>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchData {
    pub media_type: String,
    pub media_id: String,
    pub items: Vec<WatchState>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BrowseLayout {
    #[serde(default)]
    pub pages: BrowseLayoutPages,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BrowseLayoutPages {
    #[serde(default)]
    pub home: BrowseLayoutPage,
    #[serde(default)]
    pub movies: BrowseLayoutPage,
    #[serde(default)]
    pub series: BrowseLayoutPage,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct BrowseLayoutPage {
    #[serde(default)]
    pub order: Vec<String>,
    #[serde(default)]
    pub hidden: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerPreferences {
    #[serde(default = "default_subtitles_enabled")]
    pub subtitles_enabled: bool,
    #[serde(default)]
    pub subtitle_language: Option<String>,
    #[serde(default)]
    pub subtitle_delay_seconds: f64,
    #[serde(default = "default_subtitle_size")]
    pub subtitle_size: f64,
    #[serde(default)]
    pub subtitle_position: f64,
    #[serde(default = "default_subtitle_text_color")]
    pub subtitle_text_color: String,
    #[serde(default = "default_subtitle_background_color")]
    pub subtitle_background_color: String,
    #[serde(default = "default_subtitle_background_opacity")]
    pub subtitle_background_opacity: f64,
    #[serde(default = "default_subtitle_outline_color")]
    pub subtitle_outline_color: String,
    #[serde(default = "default_subtitle_outline_style")]
    pub subtitle_outline_style: String,
    #[serde(default = "default_subtitle_font_family")]
    pub subtitle_font_family: String,
    #[serde(default)]
    pub subtitle_offset_x: f64,
    #[serde(default)]
    pub subtitle_offset_y: f64,
    #[serde(default = "default_playback_speed")]
    pub playback_speed: f64,
    #[serde(default)]
    pub preferred_audio_language: Option<String>,
    #[serde(default)]
    pub preferred_audio_track_id: Option<String>,
}

impl Default for PlayerPreferences {
    fn default() -> Self {
        Self {
            subtitles_enabled: default_subtitles_enabled(),
            subtitle_language: None,
            subtitle_delay_seconds: 0.0,
            subtitle_size: default_subtitle_size(),
            subtitle_position: 0.0,
            subtitle_text_color: default_subtitle_text_color(),
            subtitle_background_color: default_subtitle_background_color(),
            subtitle_background_opacity: default_subtitle_background_opacity(),
            subtitle_outline_color: default_subtitle_outline_color(),
            subtitle_outline_style: default_subtitle_outline_style(),
            subtitle_font_family: default_subtitle_font_family(),
            subtitle_offset_x: 0.0,
            subtitle_offset_y: 0.0,
            playback_speed: default_playback_speed(),
            preferred_audio_language: None,
            preferred_audio_track_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlayerOverride {
    pub subtitles_enabled: Option<bool>,
    pub subtitle_language: Option<String>,
    pub subtitle_delay_seconds: Option<f64>,
    pub subtitle_size: Option<f64>,
    pub subtitle_position: Option<f64>,
    pub subtitle_text_color: Option<String>,
    pub subtitle_background_color: Option<String>,
    pub subtitle_background_opacity: Option<f64>,
    pub subtitle_outline_color: Option<String>,
    pub subtitle_outline_style: Option<String>,
    pub subtitle_font_family: Option<String>,
    pub subtitle_offset_x: Option<f64>,
    pub subtitle_offset_y: Option<f64>,
    pub playback_speed: Option<f64>,
    pub preferred_audio_language: Option<String>,
    pub preferred_audio_track_id: Option<String>,
}

fn default_subtitles_enabled() -> bool {
    true
}

fn default_subtitle_size() -> f64 {
    1.0
}

fn default_subtitle_text_color() -> String {
    "#FFFFFF".to_string()
}

fn default_subtitle_background_color() -> String {
    "#000000".to_string()
}

fn default_subtitle_background_opacity() -> f64 {
    0.4
}

fn default_subtitle_outline_color() -> String {
    "#000000".to_string()
}

fn default_subtitle_outline_style() -> String {
    "outline".to_string()
}

fn default_subtitle_font_family() -> String {
    "sans-serif".to_string()
}

fn default_playback_speed() -> f64 {
    1.0
}
