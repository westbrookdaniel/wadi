# wadi

Stremio-compatible media app workspace.

- `apps/frontend`: Vite/React frontend.
- `apps/server`: Rust/Axum API server with SQLite auth, lists, and addon aggregation.

Run the backend directly with:

```sh
cargo run -p wadi-server
```

By default it listens on `127.0.0.1:4000` and stores SQLite data at
`apps/server/wadi.sqlite`. Configure with `BIND_ADDR`, `DATABASE_URL`,
`IPFS_GATEWAY`, and `SESSION_TTL_DAYS`.
