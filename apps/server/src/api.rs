use std::collections::BTreeMap;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    addon::{ResourceRequest, TransportKind},
    auth,
    error::{AppError, AppResult},
    models::{AddonRecord, AuthUser, ListItem, User, UserList},
    stremio::{Manifest, ResourceKind},
    AppState,
};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
        .route("/api/addons", get(list_addons))
        .route("/api/addons/install", post(install_addon))
        .route("/api/addons/{addon_id}", get(get_addon).delete(delete_addon))
        .route("/api/addons/{addon_id}/configure", post(configure_addon))
        .route("/api/lists", get(list_lists).post(create_list))
        .route("/api/lists/{list_id}", put(update_list).delete(delete_list))
        .route("/api/lists/{list_id}/items", get(list_items).post(add_list_item))
        .route(
            "/api/lists/{list_id}/items/{item_id}",
            delete(delete_list_item),
        )
        .route("/api/catalogs", get(catalogs))
        .route("/api/catalog/{content_type}/{catalog_id}", get(catalog))
        .route("/api/meta/{content_type}/{id}", get(meta))
        .route("/api/streams/{content_type}/{id}", get(streams))
        .route("/api/subtitles/{content_type}/{id}", get(subtitles))
        .with_state(state)
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

#[derive(Debug, Deserialize)]
struct RegisterRequest {
    email: String,
    password: String,
}

async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> AppResult<(StatusCode, Json<crate::models::AuthResponse>)> {
    let email = normalize_email(&payload.email)?;
    validate_password(&payload.password)?;
    let password_hash = auth::hash_password(&payload.password)?;
    let id = Uuid::new_v4().to_string();

    let result = sqlx::query(
        r#"
        INSERT INTO users (id, email, password_hash)
        VALUES (?1, ?2, ?3)
        "#,
    )
    .bind(&id)
    .bind(&email)
    .bind(password_hash)
    .execute(&state.db)
    .await;

    if let Err(sqlx::Error::Database(err)) = &result {
        if err.is_unique_violation() {
            return Err(AppError::Conflict("email is already registered".into()));
        }
    }
    result?;

    let row = sqlx::query("SELECT id, email, created_at FROM users WHERE id = ?1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    let user = user_from_row(&row)?;
    Ok((StatusCode::CREATED, Json(auth::create_session(&state, user).await?)))
}

#[derive(Debug, Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> AppResult<Json<crate::models::AuthResponse>> {
    let email = normalize_email(&payload.email)?;
    let row = sqlx::query(
        "SELECT id, email, password_hash, created_at FROM users WHERE email = ?1 COLLATE NOCASE",
    )
    .bind(email)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let password_hash: String = row.try_get("password_hash")?;
    if !auth::verify_password(&payload.password, &password_hash)? {
        return Err(AppError::Unauthorized);
    }

    let user = user_from_row(&row)?;
    Ok(Json(auth::create_session(&state, user).await?))
}

async fn logout(
    State(state): State<AppState>,
    user: AuthUser,
    headers: axum::http::HeaderMap,
) -> AppResult<StatusCode> {
    let token = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or(AppError::Unauthorized)?;

    sqlx::query("DELETE FROM sessions WHERE user_id = ?1 AND token_hash = ?2")
        .bind(user.id)
        .bind(auth::token_hash(token))
        .execute(&state.db)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn me(user: AuthUser) -> Json<Value> {
    Json(json!({ "id": user.id, "email": user.email }))
}

#[derive(Debug, Deserialize)]
struct InstallAddonRequest {
    url: String,
}

async fn install_addon(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<InstallAddonRequest>,
) -> AppResult<(StatusCode, Json<AddonRecord>)> {
    let (transport, _manifest, manifest_json) = state.addons.fetch_manifest(&payload.url).await?;
    let existing = sqlx::query("SELECT id FROM addons WHERE user_id = ?1 AND source_url = ?2")
        .bind(&user.id)
        .bind(&payload.url)
        .fetch_optional(&state.db)
        .await?;
    let id = existing
        .as_ref()
        .and_then(|row| row.try_get::<String, _>("id").ok())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    sqlx::query(
        r#"
        INSERT INTO addons (id, user_id, source_url, transport, manifest_json)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(user_id, source_url) DO UPDATE SET
            transport = excluded.transport,
            manifest_json = excluded.manifest_json,
            updated_at = datetime('now')
        "#,
    )
    .bind(&id)
    .bind(&user.id)
    .bind(&payload.url)
    .bind(transport.to_string())
    .bind(manifest_json.to_string())
    .execute(&state.db)
    .await?;

    Ok((StatusCode::CREATED, Json(load_addon(&state, &user.id, &id).await?)))
}

async fn list_addons(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let addons = load_user_addons(&state, &user.id).await?;
    Ok(Json(json!({ "items": addons })))
}

async fn get_addon(
    State(state): State<AppState>,
    user: AuthUser,
    Path(addon_id): Path<String>,
) -> AppResult<Json<AddonRecord>> {
    Ok(Json(load_addon(&state, &user.id, &addon_id).await?))
}

async fn delete_addon(
    State(state): State<AppState>,
    user: AuthUser,
    Path(addon_id): Path<String>,
) -> AppResult<StatusCode> {
    let result = sqlx::query("DELETE FROM addons WHERE id = ?1 AND user_id = ?2")
        .bind(addon_id)
        .bind(user.id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn configure_addon(
    State(state): State<AppState>,
    user: AuthUser,
    Path(addon_id): Path<String>,
    Json(config): Json<Value>,
) -> AppResult<Json<AddonRecord>> {
    let result = sqlx::query(
        "UPDATE addons SET config_json = ?1, updated_at = datetime('now') WHERE id = ?2 AND user_id = ?3",
    )
    .bind(config.to_string())
    .bind(&addon_id)
    .bind(&user.id)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(load_addon(&state, &user.id, &addon_id).await?))
}

#[derive(Debug, Deserialize)]
struct ListRequest {
    name: String,
    description: Option<String>,
}

async fn list_lists(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let rows = sqlx::query(
        "SELECT id, name, description, created_at, updated_at FROM lists WHERE user_id = ?1 ORDER BY updated_at DESC",
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    let items = rows
        .iter()
        .map(list_from_row)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({ "items": items })))
}

async fn create_list(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<ListRequest>,
) -> AppResult<(StatusCode, Json<UserList>)> {
    let name = validate_list_name(&payload.name)?;
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO lists (id, user_id, name, description) VALUES (?1, ?2, ?3, ?4)")
        .bind(&id)
        .bind(&user.id)
        .bind(name)
        .bind(payload.description)
        .execute(&state.db)
        .await?;
    Ok((StatusCode::CREATED, Json(load_list(&state, &user.id, &id).await?)))
}

async fn update_list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(list_id): Path<String>,
    Json(payload): Json<ListRequest>,
) -> AppResult<Json<UserList>> {
    let name = validate_list_name(&payload.name)?;
    let result = sqlx::query(
        "UPDATE lists SET name = ?1, description = ?2, updated_at = datetime('now') WHERE id = ?3 AND user_id = ?4",
    )
    .bind(name)
    .bind(payload.description)
    .bind(&list_id)
    .bind(&user.id)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(Json(load_list(&state, &user.id, &list_id).await?))
}

async fn delete_list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(list_id): Path<String>,
) -> AppResult<StatusCode> {
    let result = sqlx::query("DELETE FROM lists WHERE id = ?1 AND user_id = ?2")
        .bind(list_id)
        .bind(user.id)
        .execute(&state.db)
        .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn list_items(
    State(state): State<AppState>,
    user: AuthUser,
    Path(list_id): Path<String>,
) -> AppResult<Json<Value>> {
    ensure_list_owner(&state, &user.id, &list_id).await?;
    let rows = sqlx::query(
        r#"
        SELECT id, list_id, addon_id, media_type, media_id, video_id, title, poster, release_info, meta_json, created_at
        FROM list_items
        WHERE list_id = ?1 AND user_id = ?2
        ORDER BY created_at DESC
        "#,
    )
    .bind(list_id)
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    let items = rows
        .iter()
        .map(list_item_from_row)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({ "items": items })))
}

#[derive(Debug, Deserialize)]
struct AddListItemRequest {
    addon_id: Option<String>,
    media_type: String,
    media_id: String,
    video_id: Option<String>,
    title: String,
    poster: Option<String>,
    release_info: Option<String>,
    meta: Option<Value>,
}

async fn add_list_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path(list_id): Path<String>,
    Json(payload): Json<AddListItemRequest>,
) -> AppResult<(StatusCode, Json<ListItem>)> {
    ensure_list_owner(&state, &user.id, &list_id).await?;
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO list_items
            (id, list_id, user_id, addon_id, media_type, media_id, video_id, title, poster, release_info, meta_json)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        ON CONFLICT(list_id, media_type, media_id, COALESCE(video_id, '')) DO UPDATE SET
            addon_id = excluded.addon_id,
            title = excluded.title,
            poster = excluded.poster,
            release_info = excluded.release_info,
            meta_json = excluded.meta_json
        "#,
    )
    .bind(&id)
    .bind(&list_id)
    .bind(&user.id)
    .bind(payload.addon_id)
    .bind(payload.media_type)
    .bind(payload.media_id)
    .bind(payload.video_id)
    .bind(payload.title)
    .bind(payload.poster)
    .bind(payload.release_info)
    .bind(payload.meta.map(|value| value.to_string()))
    .execute(&state.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(load_list_item_by_identity(&state, &user.id, &list_id, &id).await?),
    ))
}

async fn delete_list_item(
    State(state): State<AppState>,
    user: AuthUser,
    Path((list_id, item_id)): Path<(String, String)>,
) -> AppResult<StatusCode> {
    let result = sqlx::query(
        "DELETE FROM list_items WHERE id = ?1 AND list_id = ?2 AND user_id = ?3",
    )
    .bind(item_id)
    .bind(list_id)
    .bind(user.id)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn catalogs(State(state): State<AppState>, user: AuthUser) -> AppResult<Json<Value>> {
    let addons = load_user_addons(&state, &user.id).await?;
    let items: Vec<Value> = addons
        .into_iter()
        .flat_map(|addon| {
            let addon_id = addon.id;
            let addon_name = addon
                .manifest
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("Unknown addon")
                .to_string();
            serde_json::from_value::<Manifest>(addon.manifest)
                .ok()
                .into_iter()
                .flat_map(move |manifest| {
                    manifest.catalogs.into_iter().map({
                        let addon_id = addon_id.clone();
                        let addon_name = addon_name.clone();
                        move |catalog| {
                            json!({
                                "addon_id": addon_id,
                                "addon_name": addon_name,
                                "catalog": catalog
                            })
                        }
                    })
                })
        })
        .collect();
    Ok(Json(json!({ "items": items })))
}

async fn catalog(
    State(state): State<AppState>,
    user: AuthUser,
    Path((content_type, catalog_id)): Path<(String, String)>,
    Query(extra_args): Query<BTreeMap<String, String>>,
) -> AppResult<Json<Value>> {
    let addons = load_user_addons(&state, &user.id).await?;
    let mut responses = Vec::new();

    for addon in addons {
        let manifest: Manifest = serde_json::from_value(addon.manifest.clone())?;
        if !manifest
            .catalogs
            .iter()
            .any(|catalog| catalog.content_type == content_type && catalog.id == catalog_id)
        {
            continue;
        }
        let transport = parse_transport(&addon.transport)?;
        let response = state
            .addons
            .fetch_resource(
                &addon.source_url,
                transport,
                ResourceRequest {
                    kind: ResourceKind::Catalog,
                    content_type: content_type.clone(),
                    id: catalog_id.clone(),
                    extra_args: extra_args.clone(),
                },
                addon.config,
            )
            .await?;
        responses.push(json!({ "addon_id": addon.id, "response": response }));
    }

    Ok(Json(json!({ "responses": responses })))
}

async fn meta(
    State(state): State<AppState>,
    user: AuthUser,
    Path((content_type, id)): Path<(String, String)>,
) -> AppResult<Json<Value>> {
    aggregate_resource(state, user, ResourceKind::Meta, content_type, id).await
}

async fn streams(
    State(state): State<AppState>,
    user: AuthUser,
    Path((content_type, id)): Path<(String, String)>,
) -> AppResult<Json<Value>> {
    aggregate_resource(state, user, ResourceKind::Stream, content_type, id).await
}

async fn subtitles(
    State(state): State<AppState>,
    user: AuthUser,
    Path((content_type, id)): Path<(String, String)>,
) -> AppResult<Json<Value>> {
    aggregate_resource(state, user, ResourceKind::Subtitles, content_type, id).await
}

async fn aggregate_resource(
    state: AppState,
    user: AuthUser,
    kind: ResourceKind,
    content_type: String,
    id: String,
) -> AppResult<Json<Value>> {
    let addons = load_user_addons(&state, &user.id).await?;
    let mut responses = Vec::new();

    for addon in addons {
        let manifest: Manifest = serde_json::from_value(addon.manifest.clone())?;
        if !manifest.supports_resource(kind, &content_type, Some(&id)) {
            continue;
        }
        let transport = parse_transport(&addon.transport)?;
        let response = state
            .addons
            .fetch_resource(
                &addon.source_url,
                transport,
                ResourceRequest {
                    kind,
                    content_type: content_type.clone(),
                    id: id.clone(),
                    extra_args: BTreeMap::new(),
                },
                addon.config,
            )
            .await?;
        responses.push(json!({ "addon_id": addon.id, "response": response }));
    }

    Ok(Json(json!({ "responses": responses })))
}

fn normalize_email(email: &str) -> AppResult<String> {
    let email = email.trim().to_lowercase();
    if !email.contains('@') || email.len() > 254 {
        return Err(AppError::BadRequest("valid email is required".into()));
    }
    Ok(email)
}

fn validate_password(password: &str) -> AppResult<()> {
    if password.len() < 8 {
        return Err(AppError::BadRequest(
            "password must be at least 8 characters".into(),
        ));
    }
    Ok(())
}

fn validate_list_name(name: &str) -> AppResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("list name is required".into()));
    }
    Ok(name.to_string())
}

fn parse_transport(value: &str) -> AppResult<TransportKind> {
    TransportKind::parse(value)
        .ok_or_else(|| AppError::BadRequest(format!("unknown addon transport '{value}'")))
}

async fn load_user_addons(state: &AppState, user_id: &str) -> AppResult<Vec<AddonRecord>> {
    let rows = sqlx::query(
        "SELECT id, source_url, transport, manifest_json, config_json, installed_at, updated_at FROM addons WHERE user_id = ?1 ORDER BY installed_at DESC",
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;
    rows.iter().map(addon_from_row).collect()
}

async fn load_addon(state: &AppState, user_id: &str, addon_id: &str) -> AppResult<AddonRecord> {
    let row = sqlx::query(
        "SELECT id, source_url, transport, manifest_json, config_json, installed_at, updated_at FROM addons WHERE user_id = ?1 AND id = ?2",
    )
    .bind(user_id)
    .bind(addon_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    addon_from_row(&row)
}

async fn load_list(state: &AppState, user_id: &str, list_id: &str) -> AppResult<UserList> {
    let row = sqlx::query(
        "SELECT id, name, description, created_at, updated_at FROM lists WHERE user_id = ?1 AND id = ?2",
    )
    .bind(user_id)
    .bind(list_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    list_from_row(&row)
}

async fn ensure_list_owner(state: &AppState, user_id: &str, list_id: &str) -> AppResult<()> {
    let exists: Option<(i64,)> =
        sqlx::query_as("SELECT 1 FROM lists WHERE id = ?1 AND user_id = ?2")
            .bind(list_id)
            .bind(user_id)
            .fetch_optional(&state.db)
            .await?;
    exists.map(|_| ()).ok_or(AppError::NotFound)
}

async fn load_list_item_by_identity(
    state: &AppState,
    user_id: &str,
    list_id: &str,
    fallback_id: &str,
) -> AppResult<ListItem> {
    let row = sqlx::query(
        r#"
        SELECT id, list_id, addon_id, media_type, media_id, video_id, title, poster, release_info, meta_json, created_at
        FROM list_items
        WHERE user_id = ?1 AND list_id = ?2
        ORDER BY CASE WHEN id = ?3 THEN 0 ELSE 1 END, created_at DESC
        LIMIT 1
        "#,
    )
    .bind(user_id)
    .bind(list_id)
    .bind(fallback_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    list_item_from_row(&row)
}

fn user_from_row(row: &sqlx::sqlite::SqliteRow) -> AppResult<User> {
    Ok(User {
        id: row.try_get("id")?,
        email: row.try_get("email")?,
        created_at: row.try_get("created_at")?,
    })
}

fn addon_from_row(row: &sqlx::sqlite::SqliteRow) -> AppResult<AddonRecord> {
    let manifest_json: String = row.try_get("manifest_json")?;
    let config_json: Option<String> = row.try_get("config_json")?;
    Ok(AddonRecord {
        id: row.try_get("id")?,
        source_url: row.try_get("source_url")?,
        transport: row.try_get("transport")?,
        manifest: serde_json::from_str(&manifest_json)?,
        config: config_json
            .as_deref()
            .map(serde_json::from_str)
            .transpose()?,
        installed_at: row.try_get("installed_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn list_from_row(row: &sqlx::sqlite::SqliteRow) -> AppResult<UserList> {
    Ok(UserList {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        description: row.try_get("description")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn list_item_from_row(row: &sqlx::sqlite::SqliteRow) -> AppResult<ListItem> {
    let meta_json: Option<String> = row.try_get("meta_json")?;
    Ok(ListItem {
        id: row.try_get("id")?,
        list_id: row.try_get("list_id")?,
        addon_id: row.try_get("addon_id")?,
        media_type: row.try_get("media_type")?,
        media_id: row.try_get("media_id")?,
        video_id: row.try_get("video_id")?,
        title: row.try_get("title")?,
        poster: row.try_get("poster")?,
        release_info: row.try_get("release_info")?,
        meta: meta_json.as_deref().map(serde_json::from_str).transpose()?,
        created_at: row.try_get("created_at")?,
    })
}
