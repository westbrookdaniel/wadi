# Wadi deployment plan

Proposed 9 September 2026. Planning only; no cloud resources have been created.

## Recommendation

Use Vercel for the Next.js frontend, and Railway for the Node API and PostgreSQL. Keep one repository and the current single-command local development experience, with separate deployment entry points.

| Service | Host | Responsibility |
| --- | --- | --- |
| Next.js UI | Vercel | Pages, static assets, preview deployments |
| Node API | Railway | Authentication, profiles, lists, progress, addon requests, stream and subtitle proxy |
| PostgreSQL | Railway | Persistent account and profile data, accessed privately by the API |

Yes, Vercel can connect directly to Railway Postgres using public database networking and TLS. However, keeping the API next to the database allows private networking and avoids splitting database access across two hosts. Railway documents both [Postgres hosting](https://docs.railway.com/databases/postgresql) and [private service networking](https://docs.railway.com/networking/private-networking/how-it-works).

The current backend opens a local SQLite file through `node:sqlite`. That local file must be replaced for this deployment. This is an asynchronous database and SQL migration, not just a connection-string change.

Video responses must go directly from the browser to the provider or Railway proxy, never through a Vercel rewrite. Vercel's function duration limits include time spent streaming the response. That makes a function unsuitable as our general movie-length proxy. See [Vercel function limits](https://vercel.com/docs/functions/limitations). Test Railway's proxy behaviour with long playback and seeking before release, too.

## Implementation order

1. **Migrate storage.** Add a pooled Postgres adapter and versioned schema migrations. Convert synchronous SQLite queries to awaited queries, with parameter placeholders, booleans, timestamps, JSON and transactions handled explicitly. Use one transaction client for each multi-statement operation. Run the existing API suite against real isolated Postgres.
2. **Preserve existing data.** Take a consistent SQLite backup, including any WAL contents, before export. Import accounts and password hashes, profiles, session records, addons and order, lists/items, watch state/progress and player/layout settings. Preserve IDs and relationships. Compare table counts and representative records; prove existing login and playback resume still work. Inventory browser-local settings separately because those are not in the database.
3. **Separate deployment entry points.** Run the existing Express API as a Railway service. Configure the frontend API origin and generated stream/subtitle URLs. Disable the SQLite API adapter in the Vercel deployment. Use explicit allowed frontend origins, HTTPS, authenticated requests, and short-lived scoped playback links where a cast receiver cannot send authorization headers. Never embed database credentials in the frontend.
4. **Stage and verify.** Deploy API and Postgres together in one Railway region. Deploy the UI to Vercel. Keep staging data separate from production and prevent preview builds from writing to production. Test registration/login, profile isolation, list management, addon ordering, reload/resume, subtitles, byte ranges, a full-length stream, mobile Safari and Chromecast on real devices. Check provider IP restrictions when switching traffic from the Mac to a cloud server.
5. **Cut over.** Enable backups and test a restore. Pause writes briefly for the final SQLite export, import and validate, then deploy the matching UI/API versions. Keep the source backup and old release for rollback. If production has accepted new writes, reconcile those before reverting databases. Monitor failed requests, connection usage and streaming bandwidth costs.

## Decisions before provisioning

- Production domain and an API subdomain; Railway region near the primary viewers.
- Railway database/compute sizing, backup retention and a bandwidth budget based on measured playback.
- Whether preserving a single deployed Next.js process matters more than Vercel hosting. If it does, host the entire Next.js app plus Postgres on Railway instead. The proposed Vercel setup deliberately uses two application services.

Postgres is the recommended production database for the proposed topology. It is not needed merely to improve local playback. We can implement and test the migration before provisioning production services.
