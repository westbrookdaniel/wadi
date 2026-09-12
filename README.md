# Wadi

Wadi has a shared browsing interface, a lightweight Next.js web app, and an Electron desktop app with local streaming conversion.

**Implementation is awaiting user testing.** No builds, automated tests, playback checks, or installer checks were run for this revision. See [the manual checklist](docs/manual-testing.md).

## Architecture

- **Vercel:** Next.js pages and the hosted API. Owns authentication, authorization, profiles, addon configuration, watchlists, player settings and watch progress.
- **Railway:** PostgreSQL, accessed only by the hosted API. Desktop never receives a database URL or database credentials.
- **Desktop:** a bundled React interface, encrypted session storage and an isolated media module with FFmpeg/FFprobe subprocesses. No local auth endpoints or database server.
- **Web playback:** connects directly to providers. No hosted video proxy, subtitle proxy or conversion endpoint. Browser CORS and codec support determine compatibility. Cloud addons must use public addresses and return bounded JSON responses.

Both clients use the same hosted account and data. Desktop opens the system browser to sign in, receives a one-minute single-use authorization code over a temporary loopback callback, and exchanges it using PKCE. Its session token stays in Electron's main process, encrypted on disk through the OS keyring. The renderer receives only a signed-in marker. Linux requires a working keyring; plaintext fallback is refused.

## Web development

Use Node 24 and pnpm 10.33.2. Create a Postgres database and set `DATABASE_URL` in the shell for the schema command. Copy `apps/frontend/.env.example` to `apps/frontend/.env.local` for Next.js development.

```sh
pnpm install
pnpm db:migrate
pnpm dev
```

The schema command reads the shell environment, not Next.js `.env.local`. The web app runs on port 5173. Database migrations are explicit and do not run on each request. Existing routes are served by the Next.js API catch-all using an Express handler and a small Postgres connection pool.

### Import existing Wadi data

Run the schema migration first. Stop writes to the old SQLite app and back up its database. Point `DATABASE_URL` at an empty destination database, then run:

```sh
pnpm db:import /absolute/path/to/wadi.sqlite
```

The import preserves account IDs, password hashes, sessions, profiles, addons, lists, progress and settings. It uses a transaction, refuses nonempty target tables and opens SQLite read-only. Keep the SQLite backup until you have checked the imported data. Existing external-player templates are retained as Custom.

## Deploy Next.js to Vercel

1. Import this repository and set Root Directory to `apps/frontend`. Enable access to source files outside the root directory for the pnpm workspace.
2. Use the Next.js framework preset and Node 24. Build with `pnpm build`; let Vercel manage the output directory. Install dependencies with the committed lockfile.
3. Set server-only `DATABASE_URL` to Railway's public Postgres connection URL. Vercel cannot reach Railway private networking. Use TLS as configured by Railway and never disable certificate verification.
4. Run `pnpm db:migrate` once against that database before sending users to the app.
5. Set optional public installer links described below. Keep the Next.js app and database in nearby regions.

`SESSION_TTL_DAYS` defaults to 30. Each warm API instance uses a pool of at most three connections; a pooled database endpoint is advisable as concurrency grows. The app does not create cloud resources or migrate a remote database automatically.

| Setting | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Vercel server / migration shell | Postgres connection, never public |
| `SESSION_TTL_DAYS` | Vercel server | Session lifetime |
| `NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL` | Web build | Optional direct installer/release-page link |
| `NEXT_PUBLIC_DESKTOP_RELEASES_URL` | Web build | Release listing linked by `/desktop/download` |
| `NEXT_PUBLIC_CHROMECAST_RECEIVER_APP_ID` | Web build | Optional custom Cast receiver |
| `WADI_WEB_ORIGIN` | Desktop build | Hosted Wadi origin, e.g. `https://your-wadi.vercel.app` |
| `WADI_UPDATE_URL` | Desktop build | Optional HTTPS generic updater feed |
| `WADI_VIDEO_ENCODER` | Desktop runtime | Optional `libx264`, `h264_videotoolbox`, `h264_nvenc`, `h264_qsv`, `h264_amf` |

The web player remains available. A small corner link offers the desktop download, and failures expose external playback/copy-link options. Hosting costs exclude video transfer because it bypasses both Vercel and Railway. Railway still bills database traffic crossing to Vercel.

## Desktop development and packaging

The desktop package compiles the shared interface with Vite; it does not package Next.js API routes. The installed app does not need Node or FFmpeg installed separately.

```sh
# Start the web API separately for local development.
WADI_WEB_ORIGIN=http://localhost:5173 pnpm desktop:dev

# Build installers against your deployed API.
WADI_WEB_ORIGIN=https://your-wadi.vercel.app pnpm desktop:package
```

On Windows PowerShell set `$env:WADI_WEB_ORIGIN` before invoking pnpm. Build on each target OS/architecture so Electron and FFmpeg binaries match. Outputs are under `apps/desktop/release`: macOS DMG/ZIP, Windows NSIS installer, Linux AppImage/DEB. React assets and binaries are generated during packaging; they are not committed.

Use your normal electron-builder signing credentials for Windows signing and macOS signing/notarization. The build matrix in `.github/workflows/desktop-release.yml` is manually triggered and uploads draft artifacts only. It does not publish installers or deploy the website. Unsigned local packages are for development. Redistributing FFmpeg requires including its license/build notices; the preparation script copies notices downloaded with ffmpeg-static. Complete your distribution review before a public release.

For updates, build with `WADI_UPDATE_URL` and publish the installer artifacts and electron-builder metadata files to that HTTPS directory. Without it, automatic update checks are disabled. Desktop cannot run the shared account API offline; temporary connection failures should be retried without discarding the stored desktop session.

## Local media behavior

The desktop media module lives entirely in `apps/desktop/src/media.mjs`. It probes the source and produces a short HLS buffer while continuing to fetch/convert the movie:

- Compatible single-audio-track MP4 plays through a local byte proxy without conversion.
- H.264 video and AAC audio in other containers are copied into HLS.
- Compatible video is copied while unsupported audio is converted to AAC.
- Unsupported video is converted to H.264. macOS first tries VideoToolbox; other platforms default to software unless an encoder is selected. Failed hardware startup retries software.
- “Retry with full conversion” handles sources that probe as compatible but fail in the player.
- Seeking and audio-track/rate changes restart a local session at the requested position. Seeking depends on the provider's range/seek support.
- Pause stops conversion. Resume opens a fresh session at the saved position. The full movie is never required before playback starts.

Only one conversion runs at a time. The rolling playlist retains roughly 96 seconds plus a deletion margin, with a 512 MiB cache ceiling checked periodically. Very high-bitrate sources can reach this ceiling. Closing playback terminates its subprocess, and stale sessions are removed. Source credentials are not logged or sent to the hosted media API.

This revision does not promise real-time 4K conversion on every computer, HDR tone mapping, embedded subtitle rendering, torrent downloading or local conversion served to other devices. The shared external subtitle overlay remains available. Local media URLs are authenticated, loopback-only and scoped to this app; Chromecast cannot fetch them. Use web casting for directly supported provider URLs.

## External players

Settings offers Play in Wadi, external playback options, or copy link. Presets include Android's chooser, VLC, MPV, IINA, MX Player, Just Player, Outplayer, Moonplayer, CineUltra, Infuse, VidHub and M3U playlists, plus a custom template containing `{url}`. Presets show their platform support. Selecting a preset preserves the custom template for later.

The list and link shapes follow [Stremio Web's presets](https://github.com/Stremio/stremio-web/blob/development/src/common/CONSTANTS.js) and [Stremio Core's deep links](https://github.com/Stremio/stremio-core/blob/development/src/deep_links/mod.rs). Wadi does not send external-player callbacks to Stremio. External players must be installed, custom protocol handlers may require setup, and external playback does not sync progress back automatically. M3U is the fallback when no app protocol handler exists.

## Checks for the user

```sh
pnpm build
pnpm lint
pnpm --filter frontend test
# A disposable database; tests create and remove isolated schemas.
TEST_DATABASE_URL=postgresql://... pnpm --filter frontend test:api
```

The old SQLite standalone launcher, completed-MP4 conversion and associated smoke test were retired. Existing API tests were adapted for Postgres and the absence of cloud video endpoints; they have not been run. Complete [manual testing](docs/manual-testing.md) before relying on playback or publishing installers.
