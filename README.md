# wadi

Stremio-compatible media app workspace.

Wadi does not decode streams in the browser. Selecting a stream opens the
external-playback handoff, which defaults to copying the stream URL and can
optionally launch a player deep link. Configure the action and player URL
template in profile settings; templates use `{url}`, for example
`vlc://{url}`.

- `apps/frontend`: Vite/React frontend.
- `apps/server`: Rust/Axum API server with SQLite auth, lists, and addon aggregation.

Run the backend directly with:

```sh
cargo run -p wadi-server
```

For watched local development through Turbo, install `cargo-watch` once:

```sh
cargo install cargo-watch
pnpm dev
```

By default it listens on `127.0.0.1:4000` and stores SQLite data at
`apps/server/wadi.sqlite`. Configure with `BIND_ADDR`, `DATABASE_URL`,
`IPFS_GATEWAY`, and `SESSION_TTL_DAYS`.
