# Development and deployment

Use Node 24 and pnpm 10.33.2. Create a Postgres database and set `DATABASE_URL` in the shell for the schema command. Copy `apps/frontend/.env.example` to `apps/frontend/.env.local` for Next.js development.

```sh
pnpm install
pnpm db:migrate
pnpm dev
```

The schema command reads the shell environment, not Next.js `.env.local`. The web app runs on port 5173. Database migrations are explicit and do not run on each request. Existing routes are served by the Next.js API catch-all using an Express handler and a small Postgres connection pool.

For a local database, create a root `.env` using `.env.example`, choose a local password, and put the same connection URL in `apps/frontend/.env.local`. Then run:

```sh
docker compose up -d --wait
node --env-file=.env scripts/migrate-postgres.mjs
pnpm dev
```

Compose stores Postgres data in a persistent named volume and binds port 55432 to loopback only. `docker compose stop` keeps the data. Neither local environment file is committed.

### Import existing Wadi data

Run the schema migration first. Stop writes to the old SQLite app and back up its database. Point `DATABASE_URL` at an empty destination database, then run:

```sh
pnpm db:import /absolute/path/to/wadi.sqlite
```

The import preserves account IDs, password hashes, sessions, profiles, addons, lists, progress and settings. It uses a transaction, refuses nonempty target tables and opens SQLite read-only. Keep the SQLite backup until you have checked the imported data. Existing external-player templates are retained as Custom.

## Deploy Next.js to Vercel

1. Import this repository and set Root Directory to `apps/frontend`. Enable access to source files outside the root directory for the pnpm workspace.
2. Use the Next.js framework preset and Node 24. Build with `pnpm build`; let Vercel manage the output directory. Install dependencies with the committed lockfile.
3. Set server-only `DATABASE_URL` to Railway's public Postgres connection URL. Vercel cannot reach Railway private networking. Set DATABASE_SSL_CA to the public root certificate from the database, and DATABASE_SSL_SERVERNAME to postgres.railway.internal. The server verifies that identity through the public TCP proxy. Keep these server-only, and update the CA when rotating database certificates. Never disable certificate verification.
4. Run `pnpm db:migrate` once against that database before sending users to the app.
5. Configure a verified Resend domain and server-only RESEND_API_KEY with sending access. EMAIL_FROM defaults to Wadi <noreply@watchwadi.com>. Registration and previously unverified accounts require an emailed code before a session is issued.
6. Set optional public installer links described below. Keep the Next.js app and database in nearby regions.

`SESSION_TTL_DAYS` defaults to 30. Each warm API instance uses a pool of at most three connections; a pooled database endpoint is advisable as concurrency grows. The app does not create cloud resources or migrate a remote database automatically.

| Setting | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Vercel server / migration shell | Postgres connection, never public |
| `SESSION_TTL_DAYS` | Vercel server | Session lifetime |
| `NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL` | Web build | Optional direct installer/release-page link |
| `NEXT_PUBLIC_DESKTOP_RELEASES_URL` | Web build | Release listing linked by `/desktop/download` |
| `NEXT_PUBLIC_CHROMECAST_RECEIVER_APP_ID` | Web build | Optional custom Cast receiver |
| `WADI_WEB_ORIGIN` | Desktop build | Hosted Wadi origin, e.g. `https://watchwadi.com` |
| `WADI_VIDEO_ENCODER` | Desktop runtime | Optional `libx264`, `h264_videotoolbox`, `h264_nvenc`, `h264_qsv`, `h264_amf` |

The web player remains available. A sidebar link offers the desktop download, and failures expose external playback/copy-link options. Hosting costs exclude video transfer because it bypasses both Vercel and Railway. Railway still bills database traffic crossing to Vercel.

## Desktop development and packaging

The desktop package compiles the shared interface with Vite; it does not package Next.js API routes. The installed app does not need Node or FFmpeg installed separately.

```sh
# Start the web API separately for local development.
WADI_WEB_ORIGIN=http://localhost:5173 pnpm desktop:dev

# Build installers against your deployed API.
WADI_WEB_ORIGIN=https://watchwadi.com pnpm desktop:package
```

On Windows PowerShell set `$env:WADI_WEB_ORIGIN` before invoking pnpm. Build on each target OS/architecture so Electron and FFmpeg binaries match. Outputs are under `apps/desktop/release`: macOS DMG/ZIP, Windows NSIS installer, Linux AppImage/DEB. React assets and binaries are generated during packaging; they are not committed.

Manual workflow runs upload installer artifacts. Set the optional `release_tag` input to the matching desktop version (for example `v0.1.6`) to build all platforms and fill a draft release before publishing. Matching version tag pushes also build all platforms and create a draft GitHub release. No signing secrets are needed. FFmpeg and FFprobe license and build notices are copied into the packages by the preparation script. FFprobe is pinned to @derhuerst/ffprobe-static 5.3.0, using the same upstream b6.1.1 binary release as FFmpeg. macOS preparation and finished-package checks require the target architecture in both media binaries; signature verification remains a separate required gate.

Updates use GitHub Releases; see Desktop updates below. Desktop cannot run the shared account API offline; temporary connection failures should be retried without discarding the stored desktop session.

## Local media behavior

The desktop media module lives entirely in `apps/desktop/src/media.mjs`. It probes the source and produces a short HLS buffer while continuing to fetch/convert the movie:

- Compatible single-audio-track MP4 plays through a local byte proxy without conversion.
- H.264 video and AAC audio in other containers are copied into HLS.
- Compatible video is copied while unsupported audio is converted to AAC.
- Unsupported video is converted to H.264. macOS first tries VideoToolbox; other platforms default to software unless an encoder is selected. Failed hardware startup retries software.
- “Retry with full conversion” handles sources that probe as compatible but fail in the player.
- Pausing retains the current frame and conversion session. Conversion waits once the short look-ahead buffer is full.
- Buffered seeks and playback-speed changes reuse the session. Seeking outside the buffer or switching audio tracks starts a new one; seeking depends on provider support.
- Audio and video conversion defaults to On in device settings. Turning it Off prevents encoding; compatible playback and remuxing remain available. The full movie is never required before playback starts.

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

Targeted frontend, API and synthetic FFmpeg checks have been run during development. Provider compatibility and signed installer upgrades still need manual verification; see [the checklist](manual-testing.md).

### Playback controls and shortcuts

Desktop playback keeps the video element and local conversion session alive when paused. Conversion buffers about 32 seconds ahead of the playhead, then waits. Buffered seeks and speed changes reuse that session; seeking outside the buffer or switching audio tracks starts a new one. Local output uses FFmpeg's [HTTP upload support](https://www.ffmpeg.org/ffmpeg-formats.html#hls-2) with a private loopback endpoint to apply backpressure on all desktop platforms. The existing 512 MB cache limit remains in place.

Press `?` for the shortcut list. `F` toggles fullscreen, `/` or `Cmd/Ctrl+K` opens search, `H` opens Home, and `Cmd/Ctrl+,` opens Settings. While watching, use `Space` or `K` to play/pause, left/right arrows to seek five seconds, `J`/`L` to seek ten seconds, up/down arrows for volume, `M` to mute, and comma/period to change speed. Shortcuts leave text fields and open dialogs alone.

The synthetic local-conversion check runs with `node --test apps/desktop/src/media.test.mjs` after desktop assets are prepared. It checks audio conversion, remuxing and video conversion against actual bundled FFmpeg binaries. Provider playback and packaged installers still need manual testing.

### Desktop updates

Wadi checks the public GitHub Releases API on launch, every six hours, and from Check for updates. It compares stable versions and shows Download update when a newer release exists. Clicking opens the matching installer in the browser. If no matching build exists, it opens the release page. Users install over the existing app; Wadi does not replace files, restart, or install on quit. User data stays in the existing application data directory.

macOS releases use explicit ad-hoc signing (`identity: "-"`) without Apple certificates or notarization. Hardened runtime is disabled because ad-hoc signatures have no Team ID for library validation. CI verifies the finished app and bundled media binaries before uploading installers. Users must approve the first launch in System Settings → Privacy & Security → Open Anyway. Windows and Linux installers remain unsigned. The version tag must match apps/desktop/package.json. The workflow builds installers for each platform into a draft release. Publish the complete draft after reviewing it. No updater YAML files or signing secrets are required.

## iOS home-screen app

Open watchwadi.com in Safari, choose Share, then Add to Home Screen. The manifest and Apple touch icon launch Wadi in standalone mode with safe-area spacing. The app requires a network connection; account data and video are not cached for offline use.

### IntroDB timestamps

IntroDB is on by default. Settings → Skip segments stores the signed-in user’s preference in `users.introdb_enabled`, shared across their profiles and devices. Apply the normal `pnpm db:migrate` schema update before deploying the API. `/api/settings/introdb` reads/writes only the authenticated user’s row; the segment endpoint checks this preference before reading its cache or calling IntroDB. Account export includes the preference.

When enabled, the built-in player requests `/api/skip-segments` through the normal authenticated API client. The server calls `https://api.introdb.app/segments` with an IMDb ID and season/episode, or `is_movie=true`. Only title identifiers are forwarded: no account credentials or stream URLs. A server route is required because IntroDB's CORS response does not allow the Wadi web origin.

Successful lookups and missing entries are cached for one hour in a bounded process-local cache; upstream failures are cached for one minute. Requests time out after five seconds and identical in-flight lookups are shared. The optional metadata never blocks playback. Timestamps are seconds, validated before use, and hidden when they exceed the current stream duration. Unknown addon IDs are not guessed or resolved via extra services.

Skip buttons use the existing player seek handler (including desktop conversion and web casting), preserving pause state and progress handling. Skipping is manual; the outro button seeks to the segment end rather than forcing the next episode. The hosted API must be deployed alongside this frontend feature for desktop lookups to work.

Run `node --test apps/frontend/server/introdb.test.js` for the isolated proxy checks and the frontend test suite for segment identity, boundaries and desktop/TV controls.

## API keys and MCP

See [integrations.md](integrations.md) for the REST contract, OAuth setup, scopes, database migration and testing. Apply the additive integration schema before deploying and set `WADI_PUBLIC_ORIGIN` for non-production domains.

## Playback defaults, progress and password admission

New subtitle settings start at **1.15×** (15% larger); existing saved scales are retained. Outline weight defaults to the legacy **1.5px**, ranges from 0–6px, and shares its rendering function with the live preview. Settings → Playback on this device saves subtitle defaults locally. Title overrides keep their complete customized snapshot, including legacy 1.5px borders; **Use device defaults** in desktop/mobile or TV player settings clears the title snapshot and explicit subtitle-track choice. Automatic track selection does not create an override. Local title edits save immediately so closing the player cannot discard a pending debounce.

Local playback checkpoints store position and freshness (plus the local action timestamp used to reconcile acknowledgements). Numeric legacy checkpoints are fallback-only when there is no dated server progress. Both decoders wait for a fresh watch-data request on mount, compare timestamps rather than maximum position, and permit a local fallback after a failed fetch. Writes for one profile/title/episode are serialized; late acknowledgements cannot overwrite a later local rewind. A finished fetch does not interrupt an already-running decoder. Back during initial loading cannot save a zero checkpoint. This uses client clocks for unsynced checkpoints; devices with incorrect clocks can still fall back to server progress (checkpoints over one minute in the future are not preferred).

Login and registration share Postgres-backed admission limits **before Argon2**: 10 attempts per normalized email and 60 per IP/IPv6 /64 in a fixed 15-minute window; registration additionally allows one attempt per email per minute. Successes consume admission too, preventing authenticated traffic from bypassing hash-cost bounds. Blocked requests return 429 with a positive `Retry-After` and do not extend the window. The existing email-delivery limiter remains independent. A short transaction/advisory lock coordinates warm instances using `auth:` keys in the existing `integration_rate_limits` table; expired keys are removed and cardinality is capped at 10,000 (capacity exhaustion fails closed with a 60-second retry). No schema/provider/credential changes are required on the reviewed baseline.

On Vercel, the limiter uses a valid `x-vercel-forwarded-for` address; elsewhere it uses the socket peer and ignores untrusted forwarded headers. This follows the existing ingress assumption and [Vercel's request-header contract](https://vercel.com/docs/headers/request-headers). A custom reverse proxy may group clients under its own IP until its trust boundary is explicitly configured; no hosting WAF is assumed. NATs share the IP budget. The limiter reduces application hash work, not all possible database/network denial of service.

## Clean-environment verification

Use **Node 24**, **pnpm 10.33.2** (check `pnpm --version`, since some environments provide a different fallback), and a disposable **Postgres 17+** database owned by a user allowed to create/drop schemas. Tests need no email provider or production credentials:

```sh
pnpm install --frozen-lockfile
pnpm --filter frontend lint
pnpm --filter frontend exec tsc --noEmit
pnpm --filter frontend test --maxWorkers=2
TEST_DATABASE_URL=postgresql://test-user:test-password@127.0.0.1:5432/wadi_test pnpm --filter frontend test:api
pnpm --filter frontend build
```

Each API test creates and drops an isolated schema. Never point `TEST_DATABASE_URL` at production. Limit Vitest workers in constrained environments; the full parallel default can exhaust memory.

Full install/desktop packaging needs access to Electron and FFmpeg binary downloads in addition to the npm registry. If those downloads are blocked, `pnpm install --frozen-lockfile --ignore-scripts` supports frontend lint/types/unit/API/build verification, but **does not** prepare an Electron package. Desktop service tests additionally require `apps/desktop/assets/ffmpeg` and `ffprobe`: normally run `pnpm --filter @wadi/desktop prepare:assets` first. For cloud-only service tests, ignored local symlinks to installed system FFmpeg/FFprobe can be used; report that substitution and do not claim packaged-binary coverage. The Linux CI job verifies the actual package and bundled binaries.

For browser QA on a separate machine, build the frontend in the cloud, commit all source changes, then run `node scripts/browser-qa/build-bundle.mjs /tmp/wadi-browser-qa-<revision>`. Package that directory and transfer it through the approved file channel. The bundle records the exact commit and checksums, includes only tracked source/public frontend files/generated media, and runs with Node alone. Follow its README for desktop/mobile/TV, persistence, rewind and interrupted-start assertions. Its synthetic backend is not auth-security or live-provider acceptance. No browser, build, database, secret or provider access is needed on the streaming box beyond serving those static test bytes.
