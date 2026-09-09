# Wadi

A self-hosted streaming web app for your household. One Next.js server runs the UI, Node APIs and SQLite database. Open it in a browser on your TV computer, phone or laptop. Use Tailscale to reach the same server away from home.

Wadi includes Stremio addon support, profiles, saved lists, watch progress, subtitles and a Mediabunny player. You supply your own sources. The server must stay on while you use it.

## Set up a server

These instructions work from a checkout on Windows, macOS and Linux. They are also the setup instructions to give a coding agent. There are no signed installers or universal binaries in this repository yet. Native dependencies must be installed and built on the target OS and CPU architecture.

Install **Node.js 24 LTS**, **pnpm 10.33.2**, Git and Tailscale. Use a regular user account. Then:

```sh
git clone https://github.com/westbrookdaniel/wadi.git
cd wadi
pnpm install --frozen-lockfile
pnpm build
pnpm package:server
pnpm start
```

Open `http://localhost:5173`. Create your account, add profiles and configure addons. Keep the server terminal open for the first test. The production launcher uses the bundled Next standalone build. Node itself must be installed.

Copy `wadi-server.example.json` to `wadi-server.json` if you want to configure the port, bind address or conversion. This file is private and ignored by Git:

```json
{
  "host": "0.0.0.0",
  "port": 5173,
  "conversion": false
}
```

An optional `dataDirectory` sets an absolute path for the database and temporary conversion files. Otherwise the launcher stores them here:

| OS | Default data directory |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Wadi` |
| macOS | `~/Library/Application Support/Wadi` |
| Linux | `$XDG_DATA_HOME/wadi`, or `~/.local/share/wadi` |

Environment variables override the file: `WADI_HOST`, `PORT`, `WADI_DATA_DIR`, `DATABASE_URL`, `WADI_ENABLE_CONVERSION`. Set `WADI_ENABLE_CONVERSION=1` to allow conversion, or `0` to disable it. `SESSION_TTL_DAYS` controls session lifetime, default 30 days.

## Access from other devices with Tailscale

1. Install Tailscale on the server and each phone/computer, and sign into your tailnet.
2. On the server, run `tailscale serve --bg http://127.0.0.1:5173`.
3. Follow the HTTPS enablement prompt if Tailscale displays one. Run `tailscale serve status` and use the HTTPS address it prints.
4. Bookmark that address or add it to each device's home screen. Use the same address consistently so device preferences and login stay together.

This uses **private Tailscale Serve**, not public Funnel. No Cloudflare Tunnel, Vercel, Railway or Postgres is required. The browser uses the API on the same host; there is no separate API host to configure. HTTPS matters for browser media and controller APIs. Localhost is also a secure browser context, but a plain LAN HTTP address may lack those capabilities.

For Tailscale-only access you can set `host` to `127.0.0.1`. Keep `0.0.0.0` if you also need LAN access and allow the port through the host firewall on your private network. Tailscale may use a relay when it cannot establish a direct connection, which can reduce streaming throughput. See [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve).

## A box under the TV

The same machine can run the server and display Wadi over HDMI. It needs a desktop environment and a browser with working hardware video decoding. A headless server alone will not produce a TV interface.

In Wadi's **Settings → This device**, enable **TV navigation** on the TV browser. This preference stays on that browser; your phone keeps its normal controls.

- Arrow keys, a controller D-pad or left stick move focus between controls.
- Enter or controller A selects. Escape or B closes an open menu/dialog or goes back.
- Left/right arrows edit text or adjust sliders. Up/down leave those controls; native menus keep their own navigation. Escape leaves an editing field.
- Player controls remain visible in TV mode. Focus the seek bar to seek with arrows.
- Pair a standard browser-compatible USB/Bluetooth controller and press a button to let the browser detect it. A keyboard remote also works. Text entry still needs a keyboard or your OS on-screen keyboard. HDMI-CEC remote support is not implemented.

Use **Toggle fullscreen** in device settings for an ordinary session. For a TV that opens directly into Wadi, configure browser startup with a kiosk command after the server starts. For example, on Windows:

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --kiosk http://localhost:5173/home --edge-kiosk-type=fullscreen --no-first-run
```

Check your actual browser installation path. Edge kiosk sessions can clear browser data; for persistent login and TV preferences, a dedicated normal browser profile launched fullscreen is often more suitable. Chrome/Chromium supports `--kiosk http://localhost:5173/home` with a dedicated `--user-data-dir` directory. Keep that profile separate from your everyday browser and do not use an incognito profile. On macOS you can use the fullscreen button in a normal persistent browser window.

### Start automatically

Configure this on the target machine after a manual startup passes:

- **Windows:** Task Scheduler, at user logon, run the absolute path to `node.exe` with `"C:\path\to\wadi\scripts\start.mjs"`. Set the working directory to the checkout and restart on failure. Start the kiosk browser after the server is reachable.
- **macOS:** use a LaunchAgent with `ProgramArguments` containing the absolute Node path and `scripts/start.mjs` path, `RunAtLoad`, `KeepAlive` and log paths. Use the same user that owns the data directory. Start the browser at login.
- **Linux:** use a systemd service with `User`, `WorkingDirectory`, `ExecStart=/absolute/path/to/node /absolute/path/to/wadi/scripts/start.mjs` and `Restart=on-failure`. Enable it at boot. Start Chromium from the desktop session's autostart after `/health` responds.

Give the server a stable Tailscale machine name, disable automatic sleep, enable restart after power loss if the machine supports it, and keep the OS patched. Do not put a personal admin account into automatic login on a shared TV; use a dedicated OS account.

## Hardware estimates

These are planning estimates, not measured concurrent-stream guarantees. Source bitrate, codecs, subtitles, drivers and the browser matter more than the number of saved titles.

| Use | Suggested starting point |
| --- | --- |
| Server only, original streams, a few household clients | Recent 64-bit dual/quad-core CPU, 4 GB RAM minimum, 8 GB comfortable, 32 GB free SSD space |
| Server plus HDMI TV browser | Modern quad-core CPU with hardware video decoding, 8 GB RAM for Linux or 16 GB comfortable for Windows, 128 GB SSD, HDMI supporting your TV's resolution/refresh rate |
| Optional conversion plus TV playback | Modern CPU/iGPU with hardware H.264 encoding and decoding for your source codecs, 16 GB RAM, 256 GB SSD, active cooling |
| Multiple conversions or demanding 4K/HDR processing | Not a supported sizing target for this version. Conversion is limited to one job at a time; HDR tone mapping is not implemented |

Start with an existing PC before buying hardware. For a small box, integrated graphics with supported video acceleration is more useful than buying a CPU with many cores but no working encoder. Check the exact GPU's source codec support and its drivers. Mediabunny's server extension can use hardware acceleration, but availability is platform- and codec-dependent. An ARM board can serve the app, but do not assume it will also decode your TV streams or convert them efficiently.

Use wired gigabit Ethernet for the host where possible. Remote playback is constrained by **home upload speed**: two 10 Mb/s streams need about 20 Mb/s plus headroom. At 50 Mb/s, one stream transfers roughly 22.5 GB/hour. Original streams currently pass through Wadi's server proxy; they are not automatically bypassing the server.

Electricity estimate: a machine averaging 10 W uses about 7.2 kWh/month; 50 W uses about 36 kWh/month. Multiply by your electricity rate. There is no mandatory cloud hosting bill for this setup.

## Optional codec conversion

Conversion is **off by default**, both on the server and on each device. Enable `conversion: true` in `wadi-server.json` and restart the server. Then turn on **Settings → This device → Prepare compatible video** only on devices that need it. Turning the server flag off prevents new conversion jobs. Leave it off to avoid conversion CPU/GPU work.

Wadi uses [Mediabunny's server extension](https://mediabunny.dev/guide/extensions/server), which uses NodeAV and native FFmpeg libraries. This is not a separate FFmpeg CLI service. The dependency installation includes platform-specific native components; availability still needs validation on your target machine.

This first implementation prepares an H.264/AAC MP4 **before playback**, copying compatible tracks where possible and converting others. A progress message appears while it works. It is not live adaptive transcoding. It preserves resolution, does not tone-map HDR, and may take minutes or fail on unsupported material. Use **Play original stream** on a conversion error to turn the device preference off.

Limits: one conversion at a time, at most two cached jobs, 4 GiB output per job, a 30-minute preparation timeout, and cleanup after 30 minutes without access. Leaving the player deletes its job. Refresh starts preparation again, then resumes saved progress. Large 4K files can exceed these limits. Addon subtitles remain separately selectable; this does not burn subtitles into the picture or guarantee every embedded subtitle format survives conversion.

Chromecast still needs a reachable media URL and supported codecs. A Chromecast does not inherit your phone's Tailscale connection. This conversion mode is for browser playback; turn conversion off on the device before casting the original stream. Test your actual Chromecast on the home LAN before relying on it remotely.

## Existing data, backups and updates

The development database lives in `apps/frontend/data/wadi.sqlite`; the production launcher defaults to the OS data directory above. To keep an existing library, stop the old server and copy its SQLite database to the new directory before first startup, or point `dataDirectory` at the existing directory. Do not start two Wadi instances against the same database.

Stop Wadi before a file-copy backup. Copy `wadi.sqlite` and any matching `-wal` / `-shm` files together. Keep backups outside the installation folder. Never commit your database, addon credentials or server configuration. Conversion cache files are disposable.

To update: back up the database, stop the server, pull the new commit, run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm package:server`, then restart. Keep the old checkout/build and backup for rollback. Data stays outside the build folder. If an update changes the schema, restore the matching backup when rolling back.

## Verification and development

```sh
pnpm dev                   # Development only, port 5173
pnpm lint
pnpm --filter frontend exec tsc --noEmit
pnpm test                  # UI and API tests, including local codec conversion
pnpm build
pnpm package:server
pnpm test:next             # Isolated production auth/progress/range/deep-link checks
```

Before calling a new host ready, test login, library contents, a real stream, subtitles, seeking and refresh/resume locally and over Tailscale. On the TV test focus movement, dialogs, season selection, seeking and fullscreen. Test with an actual controller; emulated key input is not proof that every controller maps correctly. Run the conversion test on that host if enabling codecs.

The macOS build can be checked here. Windows/Linux installation, GPU drivers, HDMI output and physical controller/Chromecast behavior require checks on those devices. No installer is claimed to be signed or tested on an unavailable OS.
