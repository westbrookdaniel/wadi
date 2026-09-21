<p align="center">
  <img src="apps/frontend/public/favicon.svg" alt="Wadi" width="72" height="72" />
</p>

<h1 align="center">Wadi</h1>

<p align="center">Discover something to watch. Keep your library together.</p>

<p align="center">
  <a href="https://watchwadi.com">watchwadi.com</a> ·
  <a href="docs/development.md">Development & deployment</a>
</p>

Wadi is a media browser and player for the web and desktop. Browse catalogs from Stremio-compatible addons, save films and shows, and pick up where you left off across your devices.

## Features

- **Discover:** browse addon catalogs by content type, genre and other supported filters. Open any Home catalog row in Discover with **See all**.
- **Your library:** profiles, watchlists, watch history and Continue Watching, synced through your account.
- **A Home page you can arrange:** reorder or hide rows and choose which content appears in combined catalogs.
- **Playback your way:** use the built-in player, an external player preset, a custom player link or a copied stream URL.
- **Skip segments:** skip intros, recaps and outros in the built-in player using [IntroDB](https://introdb.app) timestamps when available. Manage it under Settings → Skip segments; the preference follows your account across devices. TV remotes are supported.
- **Desktop compatibility:** convert unsupported audio and video locally while watching. Conversion is optional and enabled by default.
- **Make it yours:** light, dark and system themes, keyboard shortcuts, and device-specific preferences.

## Web and desktop

| | Web | Desktop |
| --- | --- | --- |
| Browse, search, profiles and synced library | Yes | Yes |
| Built-in player | Browser-supported sources and formats | Local playback with optional conversion |
| Audio and video conversion | No | On your computer |
| External player links | Yes | Yes |
| Sign-in | In your browser | Through your browser |

Wadi uses addons to find catalogs and stream sources. It does not provide a film or TV subscription, host video content, or download torrents. Availability and playback depend on your addons and providers. Use sources you are authorized to access. Wadi is an independent project and is not affiliated with Stremio.

Download Wadi from [GitHub Releases](https://github.com/westbrookdaniel/wadi/releases/latest). Installers are available for Apple Silicon Macs, Windows x64 and Linux x64. macOS releases use ad-hoc signing without Apple notarization. After the first blocked launch, approve Wadi in System Settings → Privacy & Security → Open Anyway. Windows and Linux installers remain unsigned. Wadi checks GitHub for new versions and opens the installer download when you choose Download update. Install it over your existing app to keep your settings and sign-in.

For Linux installation, fullscreen, optional GPU conversion and AirPlay setup, see [Linux desktop setup](docs/linux-desktop.md).

## Run locally

You’ll need **Node.js 24**, **pnpm 10.33.2**, and **Docker Compose** or a PostgreSQL database.

```sh
pnpm install
cp .env.example .env
cp apps/frontend/.env.example apps/frontend/.env.local
```

Set a local database password in `.env`, then put the same `DATABASE_URL` in both environment files.

```sh
docker compose up -d --wait
node --env-file=.env scripts/migrate-postgres.mjs
pnpm dev
```

Open **http://localhost:5173**. To run desktop, leave the web server running and use another terminal:

```sh
pnpm desktop:dev
```

See [Development & deployment](docs/development.md) for Windows setup, an existing Postgres database, importing older Wadi data, Vercel deployment and desktop packaging.

## How it works

The Next.js web app provides the interface and account API. PostgreSQL stores account and library data. The Electron desktop app shares the interface and runs its media processing locally using FFmpeg.

Desktop connects to the hosted account API; it does not receive database credentials or bundle authentication endpoints. Web video streams go directly to the provider, so the hosted API does not process or relay video.

```text
apps/frontend/   Web app, shared interface and account API
apps/desktop/    Electron app, local media service and updater
scripts/         Database migration and import tools
docs/            Setup, deployment and verification notes
```

## Development

Bug reports should include your platform, app version, what you expected and what happened. Remove passwords, session tokens and private addon or stream URLs before sharing logs.

See the [development guide](docs/development.md) for check commands and the [manual checklist](docs/manual-testing.md) for playback and release verification.

## License

Wadi is licensed under the [MIT License](LICENSE). Third-party dependencies, including bundled FFmpeg builds, retain their own licenses and notices.
