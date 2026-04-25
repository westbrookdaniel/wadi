use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

pub async fn connect(database_url: &str) -> sqlx::Result<SqlitePool> {
    SqlitePoolOptions::new()
        .max_connections(5)
        .connect(database_url)
        .await
}

pub async fn migrate(pool: &SqlitePool) -> sqlx::Result<()> {
    sqlx::query(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY NOT NULL,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS addons (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            source_url TEXT NOT NULL,
            transport TEXT NOT NULL,
            manifest_json TEXT NOT NULL,
            config_json TEXT,
            installed_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, source_url)
        );

        CREATE TABLE IF NOT EXISTS lists (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, name)
        );

        CREATE TABLE IF NOT EXISTS list_items (
            id TEXT PRIMARY KEY NOT NULL,
            list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            addon_id TEXT,
            media_type TEXT NOT NULL,
            media_id TEXT NOT NULL,
            video_id TEXT,
            title TEXT NOT NULL,
            poster TEXT,
            release_info TEXT,
            meta_json TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS watch_states (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            media_type TEXT NOT NULL,
            media_id TEXT NOT NULL,
            video_id TEXT,
            watched INTEGER NOT NULL DEFAULT 0,
            position_seconds INTEGER NOT NULL DEFAULT 0,
            duration_seconds INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
        CREATE INDEX IF NOT EXISTS idx_addons_user ON addons(user_id);
        CREATE INDEX IF NOT EXISTS idx_lists_user ON lists(user_id);
        CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_list_items_identity
            ON list_items(list_id, media_type, media_id, COALESCE(video_id, ''));
        CREATE INDEX IF NOT EXISTS idx_watch_states_continue
            ON watch_states(user_id, watched, position_seconds, updated_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_states_identity
            ON watch_states(user_id, media_type, media_id, COALESCE(video_id, ''));
        "#,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn prune_expired_sessions(pool: &SqlitePool) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM sessions WHERE expires_at <= datetime('now')")
        .execute(pool)
        .await?;
    Ok(())
}
