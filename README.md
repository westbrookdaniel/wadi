# Wadi

A Stremio-compatible library served by one Next.js application, with SQLite accounts and profiles and an integrated MediaBunny player.

## Run

Requires Node 24+ and pnpm 10.33.2.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Next serves both the browser app and `/api` at http://127.0.0.1:5173. There is no separate API process. The existing React/TanStack screens run inside a Next page; a Next API route invokes the Node handlers directly. Node 24 is required for SQLite.

The database is `apps/frontend/data/wadi.sqlite`, excluded from Git. Set `DATABASE_URL` to an absolute path to use another database. Existing account hashes, profiles, addons and watch progress remain compatible. For an old checkout, stop its server and copy `apps/server/wadi.sqlite` into the new data directory before starting Next.

Production uses `pnpm build` then `pnpm start`, also on port 5173. Keep the SQLite data directory on persistent storage; this application needs a long-running Node host rather than ephemeral serverless storage.

Configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `apps/frontend/data/wadi.sqlite` | SQLite path; `sqlite:/path?mode=rwc` is accepted |
| `SESSION_TTL_DAYS` | `30` | Session lifetime |
| `IPFS_GATEWAY` | `https://ipfs.io` | IPFS/IPNS addon gateway |
| `NEXT_PUBLIC_API_BASE_URL` | Same origin | Browser API origin |
| `NEXT_PUBLIC_CHROMECAST_RECEIVER_APP_ID` | `CC1AD845` | Google Default Media Receiver, or your registered custom receiver |

For production, serve the frontend and API over HTTPS. The API's media proxy requires a bearer session and preserves byte ranges without buffering entire films.

## Private development access with Tailscale

Next serves `/api` and `/health` directly. Requests stay on the page's origin, including when opened from another device over HTTPS.

```sh
# Use the DNS name shown by your Tailscale client.
pnpm build && pnpm start
tailscale serve --bg http://127.0.0.1:5173
```

If Serve is disabled, follow the admin setup link printed by Tailscale. The resulting HTTPS URL is private to your tailnet. The Next process remains bound to loopback. HTTPS gives browser media APIs the secure context they require.

## Playback

Select a direct HTTP stream to play in Wadi. MediaBunny demuxes and decodes media into canvas video and Web Audio. Controls include pause, seeking, volume, playback rate, audio tracks, fullscreen, subtitle selection and styling, and episode switching. Progress and per-film preferences persist to SQLite. The player loads separately from the library bundle.

Keyboard: Space/K to pause, left/right to seek five seconds, M to mute, F for fullscreen, comma/period to change speed. Focused timeline controls also support Home/End. Inputs and menus keep their own keyboard behavior.

Playback depends on browser WebCodecs support for the stream's codecs. This is not a server transcoder or torrent engine. Magnet-only and external-only streams retain the external-player handoff. A browser decoding error is shown with the stream's codec information when available.

## Chromecast

The sender uses Google's Default Media Receiver without requiring a registered application ID. It sends the original stream URL, resume position and subtitle tracks, and controls pause, seeking, volume and mute. A successful load pauses local playback. The TV must be able to reach the stream and subtitle URLs; loopback URLs are rejected. Upstream CORS, format and codec compatibility still apply. Default-receiver playback speed and audio-track switching are not implemented; use the custom receiver for these controls.

To use the recovered Wadi custom receiver, host `apps/frontend/public/chromecast-receiver/` over HTTPS, register its URL in the Google Cast SDK Developer Console, and set `NEXT_PUBLIC_CHROMECAST_RECEIVER_APP_ID` before building. A physical Chromecast/TV is needed to verify receiver playback. SDK tests validate sender requests and failures, not hardware decoding.

References: [MediaBunny media sinks](https://mediabunny.dev/guide/media-sinks), [Google Cast sender integration](https://developers.google.com/cast/docs/web_sender/integrate).

## Checks and local screening room

```sh
pnpm build
pnpm test
pnpm lint
pnpm test:next # production integration smoke, after build
```

The backend integration tests start actual HTTP listeners and exercise authentication, profile isolation, lists, addon catalogs and streams, byte-range responses, saved preferences and SQLite persistence across restarts. Frontend tests cover the player preferences, subtitle parser, Cast sender and existing library behavior.

For a repeatable browser check without third-party content:

```sh
node apps/frontend/server/preview.js
pnpm --filter frontend dev
```

Create a disposable account in this in-memory preview, then install `http://127.0.0.1:4011/manifest.json` in Account settings → Add addon. Open Motion study and choose its local stream. The included 20-second H.264/AAC fixture has captions, allowing checks of seek, pause, speed, subtitle toggling, and Continue Watching. The fixture process on port 4011 only serves test media and an addon; the app and API remain in Next. Use `DATABASE_URL=:memory: pnpm dev` for disposable accounts without affecting your library.

Regenerate the fixture with:

```sh
ffmpeg -f lavfi -i testsrc2=size=960x540:rate=24 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 20 -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart apps/frontend/server/fixtures/playback.mp4
```
