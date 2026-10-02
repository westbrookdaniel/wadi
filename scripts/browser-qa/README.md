# Isolated browser QA handoff

This server is **test scaffolding**, not Wadi's API. The bundle contains the production frontend, synthetic media and this dependency-free Node server. API/password security is covered by the real Postgres tests, not these fixtures. It makes no outgoing requests and its CSP blocks remote resources. Run each concurrent job on its own port/process to isolate fixture state. Do not run a build or database on the streaming machine.

The generated `REVISION` identifies the exact source commit; `SHA256SUMS` covers every bundle file. Verify those before testing. Source is included in `source.tar.gz` for reference only. Run `PORT=4173 node server.mjs` from the extracted bundle (Node 24; loopback only). Stop that process after QA and delete its temporary browser profile. The browser owner supplies Puppeteer and screenshots; there is no cloud browser dependency.

## Entry points

- `/qa/bootstrap?settings=1`: fresh device settings, synthetic signed-in profile.
- `/qa/bootstrap?settings=1&legacy=1`: legacy font scale 0.9, no outline-width field.
- `/qa/bootstrap`: real web player with 120 seconds of generated video/tone and English captions; starts from server progress 60 seconds.
- `/qa/bootstrap?tv=1`: same player in TV mode. Add `settings=1` to test global TV settings.
- `/qa/state`: fixture progress, write log and delay.
- POST `/qa/control` with JSON `{ "position": 20, "delayWatchMs": 2000, "clearWrites": true }` changes simulated server progress/delay. Optional `updated_at` is an ISO timestamp. No data is persisted outside memory. Bootstrap clears **browser** storage, not the server watch state; use a fresh server process for each isolated job.

## Required browser assertions

Use desktop (1280×800), mobile (390×844), and TV (1920×1080) viewports. Capture screenshots of settings/preview and actual captions. Record browser build and media decoding support.

1. Fresh subtitle defaults show **1.15** scale and **1.5px** outline. Legacy setup retains **0.9** scale and falls back to **1.5px** outline. No silent reset of saved colours/fonts/speed/delay.
2. Edit scale to 1.25, outline colour to `#ff0000`, weight to 3, font to serif, then Save. Reload `/settings` (do not bootstrap again). Values survive. Preview updates immediately; compare computed font size/family/weight/line-height, colour, text shadow and caption background to `.player-captions` with the same settings.
3. Open `/media/movie/qa-film?playback=qa-session`, click Subtitles → Subtitle settings, change width/scale, close immediately and reload. Custom values survive. Change device defaults separately; the title keeps its overrides. Use device defaults in the player; values change immediately, reload retains the reset, and `localStorage[JSON.stringify(['wadi.device.override.v1','qa-profile','movie','qa-film'])]` is `{}` until a deliberate edit. Reset also clears `wadi.playback.qa-profile.subtitles.movie.qa-film`.
4. On mobile, settings must fit the viewport, scroll to all controls and close normally. The dialog must not hide reset/save controls. No horizontal overflow at 390px. Keyboard Tab/Enter reaches save; typing in inputs must not seek/pause playback.
5. TV: open Subtitle settings, edit Outline weight/colour with picker buttons, Back closes the picker and returns focus, then Use device defaults. Holding Enter must not repeat the reset. Back closes the settings modal without leaving the player. Global settings use TV pickers. The modest 1.15 size is a selectable TV option.
6. Pause, rewind twice, resume, navigate Back and reopen. Compare timeline against `/qa/state`; the latest rewind wins. For A→B→A, use two isolated browser contexts against one server: seed A's local checkpoint with an older `{ "position": 90, "updatedAt": <past epoch-ms> }` at `wadi.playback.qa-profile.position.movie.qa-film.`; use `/qa/control` to simulate B's newer 20-second checkpoint; reopen A without bootstrap. It must start near 20, not 90. This validates real web decoding, not Electron conversion.
7. Set watch delay to 2000ms, open playback and immediately Back. `/qa/state` must show no new zero-progress write. Page/controls remain navigable while loading.
8. Sign-out or clear `wadi.auth.token` and visit `/login`; submit a synthetic valid email/password. Fixture returns 429: the visible message contains retry time, the form stays usable, and no retry storm occurs. This is presentation coverage only; application throttle/hash-order assertions are in `server/auth-throttle.test.js`.

Report exact source revision, assertions/pass/fail, screenshots, console errors (CSP-blocked Cast bootstrap is expected), and any untested paths. Never claim Electron/live-provider/cross-physical-device acceptance from this harness.

## Focused follow-up to the d3b6866 browser findings

Keep the original failures and do not use keyboard fallback to pass pointer Play. Repeat in fresh desktop contexts (at least ten bounded attempts): wait for the enabled Seek slider, click Play once, require Pause and advancing time within the existing 6.5-second window. Record capture-phase `pointerdown`, `pointerup`, `click` targets, the target's role/name, timeline and button state. Compare the original name-only ARIA locator with an explicit `button[aria-label="Play"]` locator in separate attempts; tooltips can also have the accessible name Play. This diagnoses a possible harness target ambiguity without treating it as resolved. Initial controls now wait for the first decoded frames.

Exercise Back during initial decoding and immediately after a rewind, plus Play → Pause → rewind → Back → reopen. Preserve all console/page errors; any InputDisposedError fails the run. Check no late playback, stale progress or zero-progress write after navigation. The decoder now drains pending iterator reads before disposing the input and cancels stale playback commands.

For persistence, record input/change event values, fill Outline weight 4 then Size 1.3, immediately Close and reload **without the previous 100ms settle**. Require both values in storage and after reload. Repeat with keyboard typing/Tab and at mobile width, then reset and reload. Writes now happen synchronously on deliberate edits. If an automation fill produces no input/change event, report that separately from an application write failure; do not silently insert a delay to obtain a pass.
