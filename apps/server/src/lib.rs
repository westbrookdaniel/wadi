pub mod addon;
pub mod api;
pub mod auth;
pub mod config;
pub mod db;
pub mod error;
pub mod models;
pub mod stremio;

use std::sync::Arc;

use reqwest::Client;
use sqlx::SqlitePool;

use crate::{addon::AddonClient, config::Config};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub db: SqlitePool,
    pub http: Client,
    pub addons: Arc<AddonClient>,
}

impl AppState {
    pub fn new(config: Config, db: SqlitePool) -> Self {
        let http = Client::builder()
            .user_agent("wadi-server/0.1")
            .build()
            .expect("reqwest client configuration is valid");
        let addons = Arc::new(AddonClient::new(http.clone(), config.ipfs_gateway.clone()));

        Self {
            config,
            db,
            http,
            addons,
        }
    }
}
