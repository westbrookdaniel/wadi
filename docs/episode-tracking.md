# Episode metadata tracking

Run `pnpm db:migrate` before deploying the episode catalog endpoint. The migration adds `episode_catalogs`; it does not alter existing watch history. Rollback can leave this cache table in place.

`GET /api/episodes/series/:id` returns a combined episode list from the account's installed metadata providers. The series detail view uses it, falling back to its existing metadata when the endpoint is unavailable. Metadata is cached in Postgres per account, addon, and series for six hours. Revisiting a stale series refreshes its sources; there is no scheduled polling. Changing an addon invalidates its versioned cache, and uninstalling it removes its cache through a foreign key.

Each episode retains alternate provider video IDs, addon IDs, release precision, and any conflicting release dates. Season/episode pairs are deduplicated; unnumbered videos retain their IDs. Watched state and progress are joined from the current profile at request time. The most recent watch action wins when alternate IDs have conflicting states.

Exact timestamps normalize to UTC. Date-only releases retain their date and are considered released only after that UTC day ends. Missing, ambiguous, or contradictory dates have unknown release status. A release date does not establish stream availability.

Provider failures retain previously fetched episodes and mark the response stale. First-time failures return empty source entries with an error. New home rows, badges, a calendar, auto-pick, and autoplay are deferred for review.

Validation includes real local HTTP providers and disposable PostgreSQL schemas, covering cache hits, stale refresh failure, provider removal, alternate IDs, and profile isolation.
