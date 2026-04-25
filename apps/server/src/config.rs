#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: String,
    pub database_url: String,
    pub ipfs_gateway: String,
    pub session_ttl_days: i64,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            bind_addr: std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:4000".into()),
            database_url: std::env::var("DATABASE_URL").unwrap_or_else(|_| {
                format!(
                    "sqlite://{}/wadi.sqlite?mode=rwc",
                    env!("CARGO_MANIFEST_DIR")
                )
            }),
            ipfs_gateway: std::env::var("IPFS_GATEWAY")
                .unwrap_or_else(|_| "https://ipfs.io".into()),
            session_ttl_days: std::env::var("SESSION_TTL_DAYS")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(30),
        }
    }
}
