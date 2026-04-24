use axum::{
    body::Body,
    http::{header, Method, Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tower::ServiceExt;
use wadi_server::{api, config::Config, db, AppState};
use wiremock::{
    matchers::{method, path},
    Mock, MockServer, ResponseTemplate,
};

async fn test_app() -> axum::Router {
    let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
    db::migrate(&pool).await.unwrap();
    let state = AppState::new(
        Config {
            bind_addr: "127.0.0.1:0".into(),
            database_url: "sqlite::memory:".into(),
            ipfs_gateway: "https://gateway.example".into(),
            session_ttl_days: 30,
        },
        pool,
    );
    api::router(state)
}

async fn json_request(
    app: axum::Router,
    method: Method,
    uri: &str,
    token: Option<&str>,
    body: Value,
) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(token) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    let response = app
        .oneshot(builder.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let json = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap()
    };
    (status, json)
}

#[tokio::test]
async fn auth_and_lists_flow() {
    let app = test_app().await;

    let (status, auth) = json_request(
        app.clone(),
        Method::POST,
        "/api/auth/register",
        None,
        json!({ "email": "test@example.com", "password": "password123" }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let token = auth["token"].as_str().unwrap();

    let (status, list) = json_request(
        app.clone(),
        Method::POST,
        "/api/lists",
        Some(token),
        json!({ "name": "Watchlist", "description": "Soon" }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    let list_id = list["id"].as_str().unwrap();

    let (status, item) = json_request(
        app.clone(),
        Method::POST,
        &format!("/api/lists/{list_id}/items"),
        Some(token),
        json!({
            "media_type": "movie",
            "media_id": "tt1254207",
            "title": "Big Buck Bunny"
        }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(item["title"], "Big Buck Bunny");

    let (status, _) = json_request(
        app,
        Method::GET,
        &format!("/api/lists/{list_id}/items"),
        None,
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
#[ignore = "binds a local mock addon HTTP server; run explicitly outside restricted sandboxes"]
async fn installs_http_addon_and_fetches_streams() {
    let addon = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/manifest.json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "id": "org.example.test",
            "name": "Example",
            "version": "1.0.0",
            "types": ["movie"],
            "resources": [{ "name": "stream", "types": ["movie"], "idPrefixes": ["tt"] }],
            "catalogs": []
        })))
        .mount(&addon)
        .await;
    Mock::given(method("GET"))
        .and(path("/stream/movie/tt1254207.json"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "streams": [{ "title": "HTTP", "url": "https://cdn.example/movie.mp4" }]
        })))
        .mount(&addon)
        .await;

    let app = test_app().await;
    let (_, auth) = json_request(
        app.clone(),
        Method::POST,
        "/api/auth/register",
        None,
        json!({ "email": "addon@example.com", "password": "password123" }),
    )
    .await;
    let token = auth["token"].as_str().unwrap();

    let (status, installed) = json_request(
        app.clone(),
        Method::POST,
        "/api/addons/install",
        Some(token),
        json!({ "url": addon.uri() }),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(installed["transport"], "http");

    let (status, streams) = json_request(
        app,
        Method::GET,
        "/api/streams/movie/tt1254207",
        Some(token),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        streams["responses"][0]["response"]["streams"][0]["url"],
        "https://cdn.example/movie.mp4"
    );
}
