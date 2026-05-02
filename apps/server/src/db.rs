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

        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            avatar_key TEXT NOT NULL DEFAULT 'avatar-1',
            theme_color TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, name)
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
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
            profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, profile_id, name)
        );

        CREATE TABLE IF NOT EXISTS list_items (
            id TEXT PRIMARY KEY NOT NULL,
            list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
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
            profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
            media_type TEXT NOT NULL,
            media_id TEXT NOT NULL,
            video_id TEXT,
            watched INTEGER NOT NULL DEFAULT 0,
            position_seconds INTEGER NOT NULL DEFAULT 0,
            duration_seconds INTEGER,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
            browse_layout_json TEXT NOT NULL DEFAULT '{}',
            player_prefs_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, profile_id)
        );

        CREATE TABLE IF NOT EXISTS player_overrides (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
            media_type TEXT NOT NULL,
            media_id TEXT NOT NULL,
            settings_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, profile_id, media_type, media_id)
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
        CREATE INDEX IF NOT EXISTS idx_profiles_user ON profiles(user_id);
        CREATE INDEX IF NOT EXISTS idx_addons_user ON addons(user_id);
        CREATE INDEX IF NOT EXISTS idx_lists_user ON lists(user_id, profile_id);
        CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_list_items_identity
            ON list_items(list_id, media_type, media_id, COALESCE(video_id, ''));
        CREATE INDEX IF NOT EXISTS idx_watch_states_continue
            ON watch_states(user_id, profile_id, watched, position_seconds, updated_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_states_identity
            ON watch_states(user_id, profile_id, media_type, media_id, COALESCE(video_id, ''));
        CREATE UNIQUE INDEX IF NOT EXISTS idx_player_overrides_identity
            ON player_overrides(user_id, profile_id, media_type, media_id);
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO profiles (id, user_id, name, avatar_key)
        SELECT lower(hex(randomblob(16))), users.id, 'Main', 'avatar-1'
        FROM users
        WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = users.id)
        "#,
    )
    .execute(pool)
    .await?;

    let _ = sqlx::query(
        "ALTER TABLE sessions ADD COLUMN profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query(
        "ALTER TABLE lists ADD COLUMN profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query(
        "ALTER TABLE list_items ADD COLUMN profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query(
        "ALTER TABLE watch_states ADD COLUMN profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query(
        "ALTER TABLE user_settings ADD COLUMN profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE",
    )
    .execute(pool)
    .await;
    let _ = sqlx::query(
        "ALTER TABLE user_settings ADD COLUMN player_prefs_json TEXT NOT NULL DEFAULT '{}'",
    )
    .execute(pool)
    .await;

    sqlx::query(
        r#"
        UPDATE sessions
        SET profile_id = (
            SELECT id FROM profiles WHERE profiles.user_id = sessions.user_id ORDER BY created_at ASC LIMIT 1
        )
        WHERE profile_id IS NULL
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        UPDATE lists
        SET profile_id = (
            SELECT id FROM profiles WHERE profiles.user_id = lists.user_id ORDER BY created_at ASC LIMIT 1
        )
        WHERE profile_id IS NULL
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        UPDATE list_items
        SET profile_id = COALESCE(
            (SELECT profile_id FROM lists WHERE lists.id = list_items.list_id),
            (SELECT id FROM profiles WHERE profiles.user_id = list_items.user_id ORDER BY created_at ASC LIMIT 1)
        )
        WHERE profile_id IS NULL
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        UPDATE watch_states
        SET profile_id = (
            SELECT id FROM profiles WHERE profiles.user_id = watch_states.user_id ORDER BY created_at ASC LIMIT 1
        )
        WHERE profile_id IS NULL
        "#,
    )
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        UPDATE user_settings
        SET profile_id = (
            SELECT id FROM profiles WHERE profiles.user_id = user_settings.user_id ORDER BY created_at ASC LIMIT 1
        )
        WHERE profile_id IS NULL
        "#,
    )
    .execute(pool)
    .await?;

    let lists_schema: Option<String> =
        sqlx::query_scalar("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'lists'")
            .fetch_optional(pool)
            .await?;
    let lists_needs_rebuild = lists_schema
        .as_deref()
        .map(|sql| !sql.contains("UNIQUE(user_id, profile_id, name)"))
        .unwrap_or(false);

    let user_settings_schema: Option<String> = sqlx::query_scalar(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'user_settings'",
    )
    .fetch_optional(pool)
    .await?;
    let user_settings_needs_rebuild = user_settings_schema
        .as_deref()
        .map(|sql| {
            !sql.contains("PRIMARY KEY (user_id, profile_id)")
                || !sql.contains("player_prefs_json")
        })
        .unwrap_or(false);

    if lists_needs_rebuild || user_settings_needs_rebuild {
        let mut conn = pool.acquire().await?;
        sqlx::query("PRAGMA foreign_keys = OFF")
            .execute(&mut *conn)
            .await?;

        if lists_needs_rebuild {
            sqlx::query("DROP TABLE IF EXISTS lists_v2")
                .execute(&mut *conn)
                .await?;
            sqlx::query(
                r#"
                CREATE TABLE lists_v2 (
                    id TEXT PRIMARY KEY NOT NULL,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    description TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    UNIQUE(user_id, profile_id, name)
                );
                "#,
            )
            .execute(&mut *conn)
            .await?;
            sqlx::query(
                r#"
                INSERT OR REPLACE INTO lists_v2 (id, user_id, profile_id, name, description, created_at, updated_at)
                SELECT id, user_id, profile_id, name, description, created_at, updated_at FROM lists
                "#,
            )
            .execute(&mut *conn)
            .await?;
            sqlx::query("DROP TABLE lists").execute(&mut *conn).await?;
            sqlx::query("ALTER TABLE lists_v2 RENAME TO lists")
                .execute(&mut *conn)
                .await?;
        } else {
            sqlx::query("DROP TABLE IF EXISTS lists_v2")
                .execute(&mut *conn)
                .await?;
        }

        if user_settings_needs_rebuild {
            sqlx::query("DROP TABLE IF EXISTS user_settings_v2")
                .execute(&mut *conn)
                .await?;
            sqlx::query(
                r#"
                CREATE TABLE user_settings_v2 (
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
                    browse_layout_json TEXT NOT NULL DEFAULT '{}',
                    player_prefs_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    PRIMARY KEY (user_id, profile_id)
                );
                "#,
            )
            .execute(&mut *conn)
            .await?;
            sqlx::query(
                r#"
                INSERT OR REPLACE INTO user_settings_v2 (user_id, profile_id, browse_layout_json, player_prefs_json, created_at, updated_at)
                SELECT user_id, profile_id, browse_layout_json, COALESCE(player_prefs_json, '{}'), created_at, updated_at FROM user_settings
                "#,
            )
            .execute(&mut *conn)
            .await?;
            sqlx::query("DROP TABLE user_settings")
                .execute(&mut *conn)
                .await?;
            sqlx::query("ALTER TABLE user_settings_v2 RENAME TO user_settings")
                .execute(&mut *conn)
                .await?;
        } else {
            sqlx::query("DROP TABLE IF EXISTS user_settings_v2")
                .execute(&mut *conn)
                .await?;
        }

        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&mut *conn)
            .await?;
    }

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_lists_user ON lists(user_id, profile_id)")
        .execute(pool)
        .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_watch_states_continue ON watch_states(user_id, profile_id, watched, position_seconds, updated_at)",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_watch_states_identity_v2 ON watch_states(user_id, profile_id, media_type, media_id, COALESCE(video_id, ''))",
    )
    .execute(pool)
    .await?;
    sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_player_overrides_identity ON player_overrides(user_id, profile_id, media_type, media_id)",
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
