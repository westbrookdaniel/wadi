# IntroDB skip controls QA — 2026-09-21

## Behavior

IntroDB is on by default. Settings → Skip segments → Show skip buttons controls it for the signed-in user, shared across profiles and devices. Both the API and player enforce the preference, including cached results. When enabled, IMDb-backed episodes and movies request optional IntroDB timestamps through Wadi's authenticated API. Valid active segments show manual Skip recap, Skip intro or Skip outro controls. The button uses the existing seek handler, including progress saving and conversion-aware seeks. An outro seeks to its reported end; it does not directly launch the next episode. Existing autoplay preferences remain in effect.

## Verified

- All 167 frontend tests pass; targeted tests cover title/episode identity, specials, segment boundaries, invalid durations, no coverage, provider outages, stale episode results, desktop controls, TV activation and Back behavior.
- All 13 API tests pass against disposable local PostgreSQL 18, including separate user/session/profile preference persistence, default-on behavior, invalid writes and account export.
- Isolated HTTP tests for query validation, movie queries, caching, expired entries, malformed JSON, 404/429/network failures, and excluding Wadi authorization from the upstream request.
- ESLint, TypeScript, Next.js production build and desktop Vite renderer build.
- Live IntroDB response for Breaking Bad S1E1 parsed as an outro from 3431 to 3500 seconds. The live CORS response allows the IntroDB origin, confirming the need for the server route.
- Browser fixture used the actual PlayerChrome and segment-selection code: intro 45→80 seconds, recap 5→20 with TV Enter, outro 510→550 with a 600-second runtime; playback state remained playing. Temporary fixture files were removed afterward.
- The updated live preview verified toggling on exposes Skip intro, clicking advances 45→80 seconds, and toggling off hides the active button. The preview uses real settings/player components with a demo account.
- At a 390×844 viewport, the skip button was within bounds and clickable (x=272–374, y=664–704). TV and desktop controls were inspected through rendered DOM state.

## Limits and rollout

- The browser screenshot tool failed, so settings and all three player button states were captured using a separate offscreen Electron renderer with the actual React components and example episode data. All four PNGs were visually reviewed.
- No actual provider video, packaged desktop conversion, physical TV remote or Chromecast receiver was exercised end-to-end. The integration reuses their existing seek handler; it does not modify transport behavior.
- The disposable database was stopped after QA; production data and the installed app were not modified.
- Run `pnpm db:migrate` to add the default-true `users.introdb_enabled` column before deploying. The hosted API needs this route deployed before a desktop build can obtain timestamps. The installed Wadi app has not been replaced by this PR.
- Coverage depends on IntroDB and the source edit. Unknown/non-IMDb addon identifiers are skipped; segment ends beyond the current stream duration are suppressed.

## Release review — v0.1.7

- Fixed end-of-runtime seeks so skipping the final outro finishes playback and notifies existing autoplay instead of opening an empty desktop conversion or leaving the web player stopped without an end event. Desktop Play can restart from zero afterward.
- Empty timestamp responses expire after one minute in the client, allowing a later playback visit to recover from temporary provider failures.
- TV Back dismisses only the current visit to a segment; seeking away and back offers the skip again.
- Regression coverage includes exact-end desktop seeks, shorter empty-result cache lifetime and TV re-entry. All seven desktop service/updater tests pass after preparing the bundled media binaries.
