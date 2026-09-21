# IntroDB skip controls QA — 2026-09-21

## Behavior

IMDb-backed episodes and movies request optional IntroDB timestamps through Wadi's authenticated API. Valid active segments show manual Skip recap, Skip intro or Skip outro controls. The button uses the existing seek handler, including progress saving and conversion-aware seeks. An outro seeks to its reported end; it does not directly launch the next episode. Existing autoplay preferences remain in effect.

## Verified

- Full frontend regression suite; targeted tests cover title/episode identity, specials, segment boundaries, invalid durations, no coverage, provider outages, stale episode results, desktop controls, TV activation and Back behavior.
- Isolated HTTP tests for query validation, movie queries, caching, expired entries, malformed JSON, 404/429/network failures, and excluding Wadi authorization from the upstream request.
- ESLint, TypeScript, Next.js production build and desktop Vite renderer build.
- Live IntroDB response for Breaking Bad S1E1 parsed as an outro from 3431 to 3500 seconds. The live CORS response allows the IntroDB origin, confirming the need for the server route.
- Browser fixture used the actual PlayerChrome and segment-selection code: intro 45→80 seconds, recap 5→20 with TV Enter, outro 510→550 with a 600-second runtime; playback state remained playing. Temporary fixture files were removed afterward.
- At a 390×844 viewport, the skip button was within bounds and clickable (x=272–374, y=664–704). TV and desktop controls were inspected through rendered DOM state.

## Limits and rollout

- Screenshot capture failed in the browser tool. Layout QA used DOM geometry and interaction checks, not screenshot review.
- No actual provider video, packaged desktop conversion, physical TV remote or Chromecast receiver was exercised end-to-end. The integration reuses their existing seek handler; it does not modify transport behavior.
- The database-backed API suite was not run because no disposable TEST_DATABASE_URL was configured. The new route's isolated HTTP tests do not require a database.
- The hosted API needs this route deployed before a desktop build can obtain timestamps. The installed Wadi app has not been replaced by this PR.
- Coverage depends on IntroDB and the source edit. Unknown/non-IMDb addon identifiers are skipped; segment ends beyond the current stream duration are suppressed.
