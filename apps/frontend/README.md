# Wadi application

The Next.js app, browser player and Node/SQLite API live here. Use the root [README](../../README.md) for self-hosted setup, Tailscale, TV controls and hardware guidance.

Run development commands from the repository root. `pnpm start` there uses the production launcher and persistent OS data directory. `pnpm dev` uses this app's local `data/wadi.sqlite` unless `DATABASE_URL` is set.
