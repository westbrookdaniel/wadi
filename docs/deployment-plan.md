# Deployment split

The current plan is Next.js on Vercel, Postgres on Railway, and Electron for local media processing. The previous SQLite home-server deployment is retired. See [README](../README.md) for environment variables, migration and packaging instructions.

Cloud provisioning, schema migration against a live database, installer signing/publication and user testing have not been performed. Desktop is configured at build time with the hosted origin. It uses hosted authentication and account APIs, with no database connection or local authentication server.
