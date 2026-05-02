use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::FromRequestParts,
    http::{header, request::Parts},
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{Duration, Utc};
use rand_core::{OsRng, RngCore};
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    error::{AppError, AppResult},
    models::{AuthResponse, AuthUser, Profile, User},
    AppState,
};

pub fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default()
        .hash_password(password.as_bytes(), &salt)?
        .to_string())
}

pub fn verify_password(password: &str, password_hash: &str) -> AppResult<bool> {
    let parsed = PasswordHash::new(password_hash)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

pub fn new_token() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

pub async fn create_session(
    state: &AppState,
    user: User,
    profile: Profile,
) -> AppResult<AuthResponse> {
    let token = new_token();
    let token_hash = token_hash(&token);
    let expires_at = Utc::now() + Duration::days(state.config.session_ttl_days);

    sqlx::query(
        r#"
        INSERT INTO sessions (id, user_id, profile_id, token_hash, expires_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&user.id)
    .bind(&profile.id)
    .bind(token_hash)
    .bind(expires_at.to_rfc3339())
    .execute(&state.db)
    .await?;

    Ok(AuthResponse {
        token,
        user,
        active_profile_id: profile.id,
    })
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let token = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .map(str::to_owned);
        let db = state.db.clone();

        async move {
            let token = token.ok_or(AppError::Unauthorized)?;
            let hash = token_hash(&token);
            let row = sqlx::query(
                r#"
                SELECT users.id, users.email, sessions.profile_id
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token_hash = ?1 AND sessions.expires_at > datetime('now')
                "#,
            )
            .bind(hash)
            .fetch_optional(&db)
            .await?
            .ok_or(AppError::Unauthorized)?;

            Ok(AuthUser {
                id: row.try_get("id")?,
                email: row.try_get("email")?,
                profile_id: row.try_get("profile_id")?,
            })
        }
    }
}
