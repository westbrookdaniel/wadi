# Deployment strategy

Wadi is now intended to run as one self-hosted Next.js production server with Node APIs and a local SQLite database. Tailscale Serve provides private HTTPS access. A desktop browser on the same host can provide the TV interface over HDMI.

The earlier Vercel/Railway/Postgres plan is superseded. See the root [README](../README.md) for setup on Windows/macOS/Linux, startup configuration, hardware estimates, backups, TV navigation and optional Mediabunny conversion.

Native installers, live adaptive transcoding and a Chromecast receiver with access to private converted media are future work. The supported distribution today is a checkout built on the target OS with a production launcher.
