CREATE OR REPLACE FUNCTION wadi_now() RETURNS text LANGUAGE sql AS $$ SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;



        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
        );

        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            avatar_key TEXT NOT NULL DEFAULT 'avatar-1',
            theme_color TEXT,
            created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
            updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
            UNIQUE(user_id, name)
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
            token_hash TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
            expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS addons (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            source_url TEXT NOT NULL,
            transport TEXT NOT NULL,
            manifest_json TEXT NOT NULL,
            config_json TEXT,
            installed_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
            updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
            UNIQUE(user_id, source_url)
        );

        CREATE TABLE IF NOT EXISTS lists (
            id TEXT PRIMARY KEY NOT NULL,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
            updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
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
            created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
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
            created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
            updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
        );

        CREATE TABLE IF NOT EXISTS user_settings (
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
            browse_layout_json TEXT NOT NULL DEFAULT '{}',
            playback_prefs_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
            updated_at TEXT NOT NULL DEFAULT (to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
            PRIMARY KEY (user_id, profile_id)
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

ALTER TABLE addons ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS player_settings (profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, media_type TEXT NOT NULL DEFAULT '', media_id TEXT NOT NULL DEFAULT '', value TEXT NOT NULL, PRIMARY KEY(profile_id, media_type, media_id));
CREATE TABLE IF NOT EXISTS desktop_codes (code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL, challenge TEXT NOT NULL, expires_at TEXT NOT NULL);
ALTER TABLE watch_states ADD COLUMN IF NOT EXISTS last_stream_url TEXT;
ALTER TABLE watch_states ADD COLUMN IF NOT EXISTS recommended_stream_url TEXT;
ALTER TABLE watch_states ADD COLUMN IF NOT EXISTS recommended_stream_signature TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS player_prefs_json TEXT NOT NULL DEFAULT '{}';
