use axum::{
    body::{Body, Bytes},
    http::{HeaderMap, Method, Request, StatusCode, header},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::SqlitePool;
use tower::ServiceExt;
use wadi_server::{AppState, api, config::Config, db};
use wiremock::{
    Mock, MockServer, ResponseTemplate,
    matchers::{method, path},
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

async fn raw_request(
    app: axum::Router,
    method: Method,
    uri: &str,
    token: Option<&str>,
    body: Body,
    configure: impl FnOnce(axum::http::request::Builder) -> axum::http::request::Builder,
) -> (StatusCode, HeaderMap, Bytes) {
    let mut builder = Request::builder().method(method).uri(uri);
    if let Some(token) = token {
        builder = builder.header(header::AUTHORIZATION, format!("Bearer {token}"));
    }
    let response = app
        .oneshot(configure(builder).body(body).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    (status, headers, bytes)
}

fn encode_query_value(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
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
async fn stream_proxy_requires_auth_and_valid_http_url() {
    let app = test_app().await;

    let upstream_url = encode_query_value("https://cdn.example/movie.mp4");
    let (status, _, _) = raw_request(
        app.clone(),
        Method::GET,
        &format!("/api/stream-proxy?url={upstream_url}"),
        None,
        Body::empty(),
        |builder| builder,
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (_, auth) = json_request(
        app.clone(),
        Method::POST,
        "/api/auth/register",
        None,
        json!({ "email": "proxy-invalid@example.com", "password": "password123" }),
    )
    .await;
    let token = auth["token"].as_str().unwrap();

    let invalid_url = encode_query_value("file:///etc/passwd");
    let (status, body) = json_request(
        app,
        Method::GET,
        &format!("/api/stream-proxy?url={invalid_url}"),
        Some(token),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        body["error"]["message"]
            .as_str()
            .unwrap()
            .contains("http and https")
    );
}

#[tokio::test]
async fn stream_proxy_forwards_range_and_preserves_media_headers() {
    let app = test_app().await;
    let upstream = MockServer::start().await;

    Mock::given(method("GET"))
        .and(path("/movie.mp4"))
        .and(wiremock::matchers::header("range", "bytes=0-3"))
        .respond_with(
            ResponseTemplate::new(206)
                .insert_header("content-type", "video/mp4")
                .insert_header("content-range", "bytes 0-3/10")
                .insert_header("content-length", "4")
                .insert_header("accept-ranges", "bytes")
                .set_body_bytes("test"),
        )
        .mount(&upstream)
        .await;

    let (_, auth) = json_request(
        app.clone(),
        Method::POST,
        "/api/auth/register",
        None,
        json!({ "email": "proxy@example.com", "password": "password123" }),
    )
    .await;
    let token = auth["token"].as_str().unwrap();
    let upstream_url = encode_query_value(&format!("{}/movie.mp4", upstream.uri()));

    let (status, headers, body) = raw_request(
        app,
        Method::GET,
        &format!("/api/stream-proxy?url={upstream_url}"),
        Some(token),
        Body::empty(),
        |builder| builder.header(header::RANGE, "bytes=0-3"),
    )
    .await;

    assert_eq!(status, StatusCode::PARTIAL_CONTENT);
    assert_eq!(headers[header::CONTENT_TYPE], "video/mp4");
    assert_eq!(headers[header::CONTENT_RANGE], "bytes 0-3/10");
    assert_eq!(headers[header::CONTENT_LENGTH], "4");
    assert_eq!(headers[header::ACCEPT_RANGES], "bytes");
    assert_eq!(
        headers[header::ACCESS_CONTROL_EXPOSE_HEADERS],
        "Content-Length, Content-Range, Accept-Ranges, Content-Type"
    );
    assert_eq!(body, "test");
}

#[tokio::test]
async fn watch_state_progress_and_continue_watching_flow() {
    let app = test_app().await;

    let (_, auth) = json_request(
        app.clone(),
        Method::POST,
        "/api/auth/register",
        None,
        json!({ "email": "watch@example.com", "password": "password123" }),
    )
    .await;
    let token = auth["token"].as_str().unwrap();

    let (status, _) = json_request(
        app.clone(),
        Method::PUT,
        "/api/watch-progress",
        None,
        json!({
            "media_type": "movie",
            "media_id": "tt1254207",
            "position_seconds": 120
        }),
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, progress) = json_request(
        app.clone(),
        Method::PUT,
        "/api/watch-progress",
        Some(token),
        json!({
            "media_type": "series",
            "media_id": "tt999",
            "video_id": "tt999:1:2",
            "position_seconds": 812,
            "duration_seconds": 2400
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(progress["watched"], false);
    assert_eq!(progress["position_seconds"], 812);

    let (status, state) = json_request(
        app.clone(),
        Method::GET,
        "/api/watch-state/series/tt999?video_id=tt999%3A1%3A2",
        Some(token),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(state["video_id"], "tt999:1:2");
    assert_eq!(state["duration_seconds"], 2400);

    let (status, data) = json_request(
        app.clone(),
        Method::GET,
        "/api/watch-data/series/tt999",
        Some(token),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(data["media_type"], "series");
    assert_eq!(data["media_id"], "tt999");
    assert_eq!(data["items"].as_array().unwrap().len(), 1);
    assert_eq!(data["items"][0]["video_id"], "tt999:1:2");

    let (status, items) = json_request(
        app.clone(),
        Method::GET,
        "/api/continue-watching",
        Some(token),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(items["items"].as_array().unwrap().len(), 1);

    let (status, watched) = json_request(
        app.clone(),
        Method::PUT,
        "/api/watch-state",
        Some(token),
        json!({
            "media_type": "series",
            "media_id": "tt999",
            "video_id": "tt999:1:2",
            "watched": true
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(watched["watched"], true);
    assert_eq!(watched["position_seconds"], 812);

    let (status, items) = json_request(
        app.clone(),
        Method::GET,
        "/api/continue-watching",
        Some(token),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(items["items"].as_array().unwrap().len(), 0);

    let (status, unwatched) = json_request(
        app.clone(),
        Method::PUT,
        "/api/watch-state",
        Some(token),
        json!({
            "media_type": "series",
            "media_id": "tt999",
            "video_id": "tt999:1:2",
            "watched": false
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(unwatched["watched"], false);
    assert_eq!(unwatched["position_seconds"], 812);

    let (status, _) = json_request(
        app.clone(),
        Method::PUT,
        "/api/watch-progress",
        Some(token),
        json!({
            "media_type": "series",
            "media_id": "tt999",
            "video_id": "tt999:1:3",
            "position_seconds": 32,
            "duration_seconds": 1800
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, data) = json_request(
        app.clone(),
        Method::GET,
        "/api/watch-data/series/tt999",
        Some(token),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(data["items"].as_array().unwrap().len(), 2);

    let (status, invalid) = json_request(
        app.clone(),
        Method::PUT,
        "/api/watch-progress",
        Some(token),
        json!({
            "media_type": "movie",
            "media_id": "ttbad",
            "position_seconds": -1
        }),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        invalid["error"]["message"]
            .as_str()
            .unwrap()
            .contains("position_seconds")
    );
}

#[tokio::test]
async fn watch_state_is_user_scoped() {
    let app = test_app().await;

    let (_, first_auth) = json_request(
        app.clone(),
        Method::POST,
        "/api/auth/register",
        None,
        json!({ "email": "first@example.com", "password": "password123" }),
    )
    .await;
    let first_token = first_auth["token"].as_str().unwrap();

    let (_, second_auth) = json_request(
        app.clone(),
        Method::POST,
        "/api/auth/register",
        None,
        json!({ "email": "second@example.com", "password": "password123" }),
    )
    .await;
    let second_token = second_auth["token"].as_str().unwrap();

    let (status, _) = json_request(
        app.clone(),
        Method::PUT,
        "/api/watch-progress",
        Some(first_token),
        json!({
            "media_type": "movie",
            "media_id": "ttscope",
            "position_seconds": 240,
            "duration_seconds": 1200
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let (status, second_state) = json_request(
        app.clone(),
        Method::GET,
        "/api/watch-state/movie/ttscope",
        Some(second_token),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(second_state["position_seconds"], 0);

    let (status, second_data) = json_request(
        app.clone(),
        Method::GET,
        "/api/watch-data/movie/ttscope",
        Some(second_token),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(second_data["items"].as_array().unwrap().len(), 0);

    let (status, first_data) = json_request(
        app.clone(),
        Method::GET,
        "/api/watch-data/movie/ttscope",
        Some(first_token),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(first_data["items"].as_array().unwrap().len(), 1);

    let (status, second_continue) = json_request(
        app,
        Method::GET,
        "/api/continue-watching",
        Some(second_token),
        Value::Null,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(second_continue["items"].as_array().unwrap().len(), 0);
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
