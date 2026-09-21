# TV mode

Enable **Settings → Experimental → TV mode** on any computer or browser. The device-local setting switches to a TV presentation inside Wadi; the rail's **Exit TV mode** button returns to the desktop presentation. There is no TV operating-system requirement, native picker, platform keyboard, fullscreen request, casting UI, or external-player launch in the TV playback flow. Existing browser/desktop decoding and account/catalog services are shared.

## Interaction contract

- Arrows move between controls. OK/Enter (controller A) activates; Escape/BrowserBack (controller B) goes back. Standard gamepad navigation has an initial repeat delay and throttled held-arrow repeats.
- Pickers are buttons until activated. An in-app dialog highlights the current value; arrows move, OK commits, Back cancels and returns to the trigger. This applies to both native desktop settings selects and Radix desktop selects.
- Text fields open an in-app keyboard with letters, shift, numbers, punctuation, space, delete and clear. Hardware typing also works. Done applies the edit; Back discards it. No native keyboard is required. Password fields stay masked.
- Sliders require OK to enter adjustment. Left/right changes the value; OK/Back finishes. Up/down can leave the control.
- Focus belongs to the topmost overlay, then the current page/region. Page memory uses stable content keys and row identity. Search queries and watchlist filters/sorting are retained in memory per profile while using TV mode. Loading content gets its entry target when ready; user movement cancels pending automatic focus. Background refreshes preserve valid focus. Removal or disabling selects a nearby remaining target.
- Home uses large content rows, with Continue Watching first when enabled. Details use a large overview followed by episodes/streams. Search/discovery/watchlists use larger shared content controls. Settings show one category at a time; layout/addon reordering has explicit up/down actions.
- The TV player has its own input owner. OK reveals hidden controls; left/right from hidden controls enters seek preview. Seek moves by ten seconds, OK applies, Back cancels. Back hides controls before returning to details. Controls hide after four seconds of idle playback and stay available while paused, seeking or choosing an option.
- Audio/subtitles, speed, subtitle size/timing and episodes use in-app controls. Up-next is a scoped in-app dialog. TV mode sets app gain to full, without mute/volume controls, leaving listening volume to the TV/computer. External/copy playback preferences are retained but bypassed while TV mode is active. Unsupported streams show an in-app explanation and Back action.

## Implementation boundaries

`TvShell`, `TvDetail`, and `TvPlayerChrome` are separate presentation components. Home and settings select their TV presentation while reusing the existing queries/mutations. Shared select adapters use `TvPicker`. `TvNavigation` owns page/region focus, gamepad normalization and entry to `TvKeyboard`; it delegates to the TV player and open custom menus. Actual DOM focus remains synchronized with visual focus.

TV tokens and component styles live in `src/components/tv/tv.css`, loaded from the Next.js custom App so dialogs portaled to the document body share TV colors and sizes. The preference does not change the saved desktop theme.

## Review and validation

Run `pnpm test`, `pnpm --filter frontend lint`, and `pnpm --filter frontend build`.

A self-contained development fixture uses the actual TV components, with sample titles and simulated playback state:

```sh
pnpm --filter frontend exec vite --config vitest.config.ts --host 127.0.0.1 --port 5173
# Open http://127.0.0.1:5173/tv-preview.html
```

The fixture has no account/API requirements and is not a production route. It is for interaction/layout review, not codec or real-stream validation. It sets TV mode on that preview origin only.

Automated checks cover picker entry/cancellation, controlled-field keyboard edits, route restoration after loading, preservation during updates, seek commit/cancel, control hiding, and removal of volume/fullscreen controls. Regression coverage also includes rich select labels/trigger associations, focus recovery after an overlay action disappears, held OK/Back keys, numeric keyboard validation, hardware typing from Done, batched browse-state updates, slider Back inside dialogs, and the idle timeout after a player picker closes. Existing desktop navigation tests remain in place.

Before removing the experimental label, perform a physical television/remote acceptance pass with real media: browse → details → season/episode → stream → playback → return to the same card; search and profile/account forms; empty/error/retry states; long translated labels; subtitle readability; held gamepad arrows; next-episode transition. Screenshot capture was unavailable during development, so screenshot-based visual QA and actual TV viewing-distance checks remain outstanding.

Development validation: 154 frontend tests pass, lint passes, and the production build passes. Browser interaction checks used the fixture at 1920×1080 and 1280×720. Five database-backed API tests cannot start without `TEST_DATABASE_URL` pointing to a disposable PostgreSQL database; the four non-database API checks pass.

Review fixes: TV profile actions now use a scoped in-app dialog; pickers preserve rich labels, placeholders, custom display values and trigger associations, and scroll their current option into view. Keyboard drafts respect the source field’s validation constraints before applying changes. Held OK/Back is ignored until the key is released.
