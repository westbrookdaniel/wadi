use std::collections::BTreeMap;

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Query, State},
    http::{
        HeaderMap, HeaderValue, Response, StatusCode,
        header::{
            ACCEPT_RANGES, ACCESS_CONTROL_EXPOSE_HEADERS, CACHE_CONTROL, CONTENT_LENGTH,
            CONTENT_RANGE, CONTENT_TYPE, ETAG, EXPIRES, LAST_MODIFIED, RANGE,
        },
    },
    routing::{delete, get, post, put},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    AppState,
    addon::{ResourceRequest, TransportKind},
    auth,
    error::{AppError, AppResult},
    models::{AddonRecord, AuthUser, ListItem, User, UserList, WatchData, WatchState},
    stremio::{Manifest, ResourceKind},
};

const DEFAULT_LIST_NAME: &str = "Saved";

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/me", get(me))
        .route("/api/addons", get(list_addons))
        .route("/api/addons/install", post(install_addon))
        .route(
            "/api/addons/{addon_id}",
            get(get_addon).delete(delete_addon),
        )
        .route("/api/addons/{addon_id}/configure", post(configure_addon))
        .route("/api/lists", get(list_lists).post(create_list))
        .route("/api/lists/{list_id}", put(update_list).delete(delete_list))
        .route(
            "/api/lists/{list_id}/items",
            get(list_items).post(add_list_item),
        )
        .route(
            "/api/lists/{list_id}/items/{item_id}",
            delete(delete_list_item),
        )
        .route("/api/catalogs", get(catalogs))
        .route("/api/catalog/{content_type}/{catalog_id}", get(catalog))
        .route("/api/meta/{content_type}/{id}", get(meta))
        .route("/api/streams/{content_type}/{id}", get(streams))
        .route("/api/subtitles/{content_type}/{id}", get(subtitles))
        .route("/api/stream-proxy", get(stream_proxy))
        .route("/api/watch-state", put(set_watch_state))
        .route("/api/watch-state/{content_type}/{id}", get(get_watch_state))
        .route("/api/watch-data/{content_type}/{id}", get(get_watch_data))
        .route("/api/watch-progress", put(set_watch_progress))
        .route("/api/continue-watching", get(continue_watching))
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
    ensure_default_list(&state, &id).await?;

    let row = sqlx::query("SELECT id, email, created_at FROM users WHERE id = ?1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;
    let user = user_from_row(&row)?;
    Ok((
        StatusCode::CREATED,
        Json(auth::create_session(&state, user).await?),
    ))
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

    Ok((
        StatusCode::CREATED,
        Json(load_addon(&state, &user.id, &id).await?),
    ))
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
    ensure_default_list(&state, &user.id).await?;
    let rows = sqlx::query(
        "SELECT id, name, description, created_at, updated_at FROM lists WHERE user_id = ?1 ORDER BY CASE WHEN lower(name) = lower(?2) THEN 0 ELSE 1 END, updated_at DESC",
    )
    .bind(user.id)
    .bind(DEFAULT_LIST_NAME)
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
    ensure_default_list(&state, &user.id).await?;
    let name = validate_list_name(&payload.name)?;
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO lists (id, user_id, name, description) VALUES (?1, ?2, ?3, ?4)")
        .bind(&id)
        .bind(&user.id)
        .bind(name)
        .bind(payload.description)
        .execute(&state.db)
        .await?;
    Ok((
        StatusCode::CREATED,
        Json(load_list(&state, &user.id, &id).await?),
    ))
}

async fn update_list(
    State(state): State<AppState>,
    user: AuthUser,
    Path(list_id): Path<String>,
    Json(payload): Json<ListRequest>,
) -> AppResult<Json<UserList>> {
    ensure_default_list(&state, &user.id).await?;
    if is_default_list(&state, &user.id, &list_id).await? {
        return Err(AppError::BadRequest("default list cannot be renamed".into()));
    }
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
    ensure_default_list(&state, &user.id).await?;
    if is_default_list(&state, &user.id, &list_id).await? {
        return Err(AppError::BadRequest("default list cannot be deleted".into()));
    }
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
    let result =
        sqlx::query("DELETE FROM list_items WHERE id = ?1 AND list_id = ?2 AND user_id = ?3")
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

#[derive(Debug, Deserialize)]
struct SetWatchStateRequest {
    media_type: String,
    media_id: String,
    video_id: Option<String>,
    watched: bool,
}

#[derive(Debug, Deserialize)]
struct SetWatchProgressRequest {
    media_type: String,
    media_id: String,
    video_id: Option<String>,
    position_seconds: i64,
    duration_seconds: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct WatchStateQuery {
    video_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ContinueWatchingQuery {
    limit: Option<i64>,
}

async fn set_watch_state(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<SetWatchStateRequest>,
) -> AppResult<Json<WatchState>> {
    let media_type = validate_identity_part(&payload.media_type, "media_type")?;
    let media_id = validate_identity_part(&payload.media_id, "media_id")?;
    let video_id = normalize_optional_identity(payload.video_id);
    upsert_watch_state(
        &state,
        &user.id,
        &media_type,
        &media_id,
        video_id.as_deref(),
        Some(payload.watched),
        None,
        None,
    )
    .await?;
    Ok(Json(
        load_watch_state(
            &state,
            &user.id,
            &media_type,
            &media_id,
            video_id.as_deref(),
        )
        .await?,
    ))
}

async fn set_watch_progress(
    State(state): State<AppState>,
    user: AuthUser,
    Json(payload): Json<SetWatchProgressRequest>,
) -> AppResult<Json<WatchState>> {
    if payload.position_seconds < 0 {
        return Err(AppError::BadRequest(
            "position_seconds must be at least 0".into(),
        ));
    }
    if matches!(payload.duration_seconds, Some(duration) if duration <= 0) {
        return Err(AppError::BadRequest(
            "duration_seconds must be greater than 0".into(),
        ));
    }

    let media_type = validate_identity_part(&payload.media_type, "media_type")?;
    let media_id = validate_identity_part(&payload.media_id, "media_id")?;
    let video_id = normalize_optional_identity(payload.video_id);
    let watched = payload
        .duration_seconds
        .filter(|duration| payload.position_seconds >= *duration)
        .map(|_| true);

    upsert_watch_state(
        &state,
        &user.id,
        &media_type,
        &media_id,
        video_id.as_deref(),
        watched,
        Some(payload.position_seconds),
        Some(payload.duration_seconds),
    )
    .await?;
    Ok(Json(
        load_watch_state(
            &state,
            &user.id,
            &media_type,
            &media_id,
            video_id.as_deref(),
        )
        .await?,
    ))
}

async fn get_watch_state(
    State(state): State<AppState>,
    user: AuthUser,
    Path((media_type, media_id)): Path<(String, String)>,
    Query(query): Query<WatchStateQuery>,
) -> AppResult<Json<WatchState>> {
    let media_type = validate_identity_part(&media_type, "media_type")?;
    let media_id = validate_identity_part(&media_id, "media_id")?;
    let video_id = normalize_optional_identity(query.video_id);
    Ok(Json(
        load_watch_state(
            &state,
            &user.id,
            &media_type,
            &media_id,
            video_id.as_deref(),
        )
        .await?,
    ))
}

async fn get_watch_data(
    State(state): State<AppState>,
    user: AuthUser,
    Path((media_type, media_id)): Path<(String, String)>,
) -> AppResult<Json<WatchData>> {
    let media_type = validate_identity_part(&media_type, "media_type")?;
    let media_id = validate_identity_part(&media_id, "media_id")?;
    Ok(Json(
        load_watch_data(&state, &user.id, &media_type, &media_id).await?,
    ))
}

async fn continue_watching(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<ContinueWatchingQuery>,
) -> AppResult<Json<Value>> {
    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let rows = sqlx::query(
        r#"
        SELECT media_type, media_id, video_id, watched, position_seconds, duration_seconds, updated_at
        FROM watch_states
        WHERE user_id = ?1 AND watched = 0 AND position_seconds > 0
        ORDER BY updated_at DESC
        LIMIT ?2
        "#,
    )
    .bind(user.id)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;
    let items = rows
        .iter()
        .map(watch_state_from_row)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({ "items": items })))
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

#[derive(Debug, Deserialize)]
struct StreamProxyQuery {
    url: String,
}

async fn stream_proxy(
    State(state): State<AppState>,
    _user: AuthUser,
    headers: HeaderMap,
    Query(query): Query<StreamProxyQuery>,
) -> AppResult<Response<Body>> {
    let url = url::Url::parse(&query.url)?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AppError::BadRequest(
            "stream proxy only supports http and https URLs".into(),
        ));
    }

    let mut request = state.http.get(url);
    if let Some(range) = headers.get(RANGE) {
        request = request.header(RANGE, range);
    }

    let upstream = request.send().await?;
    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();
    let mut response = Response::builder().status(status);

    for name in [
        CONTENT_TYPE,
        CONTENT_LENGTH,
        CONTENT_RANGE,
        ACCEPT_RANGES,
        ETAG,
        LAST_MODIFIED,
        CACHE_CONTROL,
        EXPIRES,
    ] {
        if let Some(value) = upstream_headers.get(&name) {
            response = response.header(name, value);
        }
    }

    response = response.header(
        ACCESS_CONTROL_EXPOSE_HEADERS,
        HeaderValue::from_static("Content-Length, Content-Range, Accept-Ranges, Content-Type"),
    );

    if !upstream_headers.contains_key(ACCEPT_RANGES) {
        response = response.header(ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    }

    response
        .body(Body::from_stream(upstream.bytes_stream()))
        .map_err(|err| AppError::Upstream(err.to_string()))
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
    if name.eq_ignore_ascii_case(DEFAULT_LIST_NAME) {
        return Err(AppError::BadRequest(
            "list name is reserved for the default list".into(),
        ));
    }
    Ok(name.to_string())
}

async fn ensure_default_list(state: &AppState, user_id: &str) -> AppResult<()> {
    let default_id = Uuid::new_v4().to_string();
    sqlx::query(
        r#"
        INSERT INTO lists (id, user_id, name, description)
        SELECT ?1, ?2, ?3, NULL
        WHERE NOT EXISTS (
            SELECT 1 FROM lists WHERE user_id = ?2 AND lower(name) = lower(?3)
        )
        "#,
    )
    .bind(default_id)
    .bind(user_id)
    .bind(DEFAULT_LIST_NAME)
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn is_default_list(state: &AppState, user_id: &str, list_id: &str) -> AppResult<bool> {
    let row = sqlx::query("SELECT name FROM lists WHERE id = ?1 AND user_id = ?2")
        .bind(list_id)
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?;
    let Some(row) = row else {
        return Err(AppError::NotFound);
    };
    let name: String = row.try_get("name")?;
    Ok(name.eq_ignore_ascii_case(DEFAULT_LIST_NAME))
}

fn validate_identity_part(value: &str, field: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(AppError::BadRequest(format!("{field} is required")));
    }
    Ok(value.to_string())
}

fn normalize_optional_identity(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let value = value.trim().to_string();
        (!value.is_empty()).then_some(value)
    })
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

async fn upsert_watch_state(
    state: &AppState,
    user_id: &str,
    media_type: &str,
    media_id: &str,
    video_id: Option<&str>,
    watched: Option<bool>,
    position_seconds: Option<i64>,
    duration_seconds: Option<Option<i64>>,
) -> AppResult<()> {
    let id = Uuid::new_v4().to_string();
    let watched_value = watched.map(|value| if value { 1_i64 } else { 0_i64 });
    sqlx::query(
        r#"
        INSERT INTO watch_states
            (id, user_id, media_type, media_id, video_id, watched, position_seconds, duration_seconds)
        VALUES
            (?1, ?2, ?3, ?4, ?5, COALESCE(?6, 0), COALESCE(?7, 0), ?8)
        ON CONFLICT(user_id, media_type, media_id, COALESCE(video_id, '')) DO UPDATE SET
            watched = CASE WHEN ?9 THEN excluded.watched ELSE watch_states.watched END,
            position_seconds = CASE WHEN ?10 THEN excluded.position_seconds ELSE watch_states.position_seconds END,
            duration_seconds = CASE WHEN ?11 THEN excluded.duration_seconds ELSE watch_states.duration_seconds END,
            updated_at = datetime('now')
        "#,
    )
    .bind(id)
    .bind(user_id)
    .bind(media_type)
    .bind(media_id)
    .bind(video_id)
    .bind(watched_value)
    .bind(position_seconds)
    .bind(duration_seconds.flatten())
    .bind(watched.is_some())
    .bind(position_seconds.is_some())
    .bind(duration_seconds.is_some())
    .execute(&state.db)
    .await?;
    Ok(())
}

async fn load_watch_state(
    state: &AppState,
    user_id: &str,
    media_type: &str,
    media_id: &str,
    video_id: Option<&str>,
) -> AppResult<WatchState> {
    let row = sqlx::query(
        r#"
        SELECT media_type, media_id, video_id, watched, position_seconds, duration_seconds, updated_at
        FROM watch_states
        WHERE user_id = ?1 AND media_type = ?2 AND media_id = ?3 AND COALESCE(video_id, '') = COALESCE(?4, '')
        "#,
    )
    .bind(user_id)
    .bind(media_type)
    .bind(media_id)
    .bind(video_id)
    .fetch_optional(&state.db)
    .await?;

    match row {
        Some(row) => watch_state_from_row(&row),
        None => Ok(WatchState {
            media_type: media_type.to_string(),
            media_id: media_id.to_string(),
            video_id: video_id.map(ToString::to_string),
            watched: false,
            position_seconds: 0,
            duration_seconds: None,
            updated_at: None,
        }),
    }
}

async fn load_watch_data(
    state: &AppState,
    user_id: &str,
    media_type: &str,
    media_id: &str,
) -> AppResult<WatchData> {
    let rows = sqlx::query(
        r#"
        SELECT media_type, media_id, video_id, watched, position_seconds, duration_seconds, updated_at
        FROM watch_states
        WHERE user_id = ?1 AND media_type = ?2 AND media_id = ?3
        ORDER BY COALESCE(video_id, ''), updated_at DESC
        "#,
    )
    .bind(user_id)
    .bind(media_type)
    .bind(media_id)
    .fetch_all(&state.db)
    .await?;
    let items = rows
        .iter()
        .map(watch_state_from_row)
        .collect::<Result<Vec<_>, _>>()?;

    Ok(WatchData {
        media_type: media_type.to_string(),
        media_id: media_id.to_string(),
        items,
    })
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
    let name: String = row.try_get("name")?;
    Ok(UserList {
        id: row.try_get("id")?,
        is_default: name.eq_ignore_ascii_case(DEFAULT_LIST_NAME),
        name,
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

fn watch_state_from_row(row: &sqlx::sqlite::SqliteRow) -> AppResult<WatchState> {
    let watched: i64 = row.try_get("watched")?;
    Ok(WatchState {
        media_type: row.try_get("media_type")?,
        media_id: row.try_get("media_id")?,
        video_id: row.try_get("video_id")?,
        watched: watched != 0,
        position_seconds: row.try_get("position_seconds")?,
        duration_seconds: row.try_get("duration_seconds")?,
        updated_at: row.try_get("updated_at")?,
    })
}
