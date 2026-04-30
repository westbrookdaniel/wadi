use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: User,
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
