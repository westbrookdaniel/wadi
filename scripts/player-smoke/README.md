# Real player CI smoke

The `web-player-smoke` job builds production Next output; the macOS candidate job drives its existing sealed synthetic Electron package through owned loopback CDP. Neither runs on the shared QA Mac. Commands:

```
pnpm test:qa-fixtures
pnpm test:player-smoke web /absolute/web-bundle
pnpm test:player-smoke native /absolute/native-bundle /absolute/Wadi.app/Contents/MacOS/Wadi
```

Local GUI runs require the assigned physical QA slot. Native execution requires macOS arm64, prior finished app/media CPU and deep/strict signature checks, plus archive checksums. The driver verifies source bundle hashes and the launched app's embedded revision and production module bytes. It does not run the rejected raw development Electron runtime or bypass signatures/security. All data/cache/server/CDP processes are owned and cleaned up. No retries: the first failure remains failing, with evidence uploaded even when the command fails.

Synthetic fixture contract `tones-v2-440-880-660`: 120-second generated bars, English/default440 Hz, Japanese880 Hz, and English alternate660 Hz. The extra same-language track detects option locking. English/French SRT text is exactly ENGLISH QA CAPTION / FRENCH QA CAPTION; the alternative English caption has distinct text. Two playable URLs carry exact `token=synthetic-only&source=1|2` queries. Web and native use the same generator and API routes. Unexpected API paths/methods/progress shapes fail and are recorded. Loopback-only control endpoints hold/release responses or force HTTP errors deterministically.

Real pointer/keyboard actions select/reopen/check menus. A test-only Web Audio observer measures decoded output, with post-volume samples for the web engine and the actual HTML video output for native HLS/conversion. It never supplies audio, sets selection, or replaces playback handlers. Native audio observation resumes on an actual UI gesture. This is decoded output evidence, not physical speakers. The native wrapper mocks session authentication only after the production trusted-frame check. Main, preload, media, clipboard, permissions and renderer modules remain real.

Clipboard success compares only the known synthetic URL after real UI copy, including keyboard Enter after source replacement/reload. Native reads use runner `pbpaste`, with no new production read bridge. A no-gesture call must reject and leave the known clipboard unchanged. The web-only injected write failure checks fallback presentation separately; native denial presentation also has existing component unit coverage, but physical OS denial is not claimed.

Evidence: per-phase results/timing/screenshots, source/module identity, graph frequency/dB samples, selected-state assertions, console/page/network errors, fixture request/write logs, complete native process logs and a Playwright trace. Failures stay failing; archive names include SHA and run attempt, retaining earlier failed attempts. The narrow optional Cast CSP diagnostic and exercised subtitle HTTP failure are retained. A cancelled-probe navigation diagnostic is classified only in the successful source/reload phase, with timestamp/phase evidence; active media/IPC/page errors fail.

Pilot budgets are provisional: <=4 minutes for the separate Chromium job including setup/build; <=90 seconds added native smoke, excluding the already-existing fixture/package steps. Actual GitHub step/job timings determine whether these hold. Windows/Linux native GUI, physical speakers, native OS write denial, real PKCE/providers/casting/TV remotes, movie/episode detail redesign, and installed/notarized release behavior are not covered by this initial smoke. Add title/episode fixtures with the separately approved detail UX work.

The first real Mac pilot exposed playbackRate resetting to 1 after HLS attachment while the speed control still showed 1.25x. The focused hook correction synchronizes defaultPlaybackRate and playbackRate; a load-reset regression fails on released main and passes with the fix. The smoke retains the real property assertion. CDP Escape does not operate Chromium browser-level fullscreen accelerators; fullscreen exit uses Wadi’s real F shortcut, while menu Escape is checked separately.
