# Detail and inline stream QA

Use the exact CI artifact and its REVISION. Verify the outer web-player-qa.SHA256SUMS before extracting, then the internal SHA256SUMS. The bundle includes production Next output, synthetic fixtures, source archive and checksums.

Open `/qa/bootstrap?tracks=1&detail=1&auto=1` on the isolated loopback fixture server. Repeat with `auto=0`. Both show Synthetic QA film details and description without playing, even with legacy skip-selection enabled. There is no Watch action. Streams are always visible: the source selector appears above the full list, and choosing a stream starts playback directly. There is no stream expander. Check keyboard Enter and the 390px layout.

Choose QA 2. Copy stream link must equal the source URL with `token=synthetic-only&source=2`. Back returns to details; choose QA 2 again to resume at the saved position. There is no separate selected-stream state to restore. For series, the episode chooser (Back) and episode title share one row above the source selector.

Home exposes Synthetic QA film (QA 1/2), Synthetic second film (QA 3/4), and Synthetic QA show. Episode 1 in Season 1 uses QA 5/6; episode 2 in Season 2 uses QA 7/8. Choose QA 8 directly, then Back: Season 2 remains active. Change to Season 1 and verify only QA 5/6 appear. Progress must be saved against the correct episode.

The loopback-only `/qa/control` POST endpoint supports rules for known stream paths: `{hold:true}`, `{status:503}`, `{empty:true}` or `{unavailable:true}`. Release with `{rules:{[path]:{}},release:path}`. `/qa/state` records pending/completed requests and progress writes. Hold episode 1, switch to episode 2, then release: QA 7/8 must remain. Hold the first movie, navigate Home to the second, then release: QA 3/4 must remain. Loading/error/empty states must not launch playback; unavailable stream cards are disabled. Clear the error rule and use Retry to recover.

CI checks real Chromium actions, decoded Web Audio measurements, captions and clipboard success/failure. The sealed Mac candidate repeats native player/clipboard and movie Back/direct stream replay. Physical speakers, native OS denial, real providers/PKCE/casting/TV remotes and installed release behavior remain manual gates. Keep failed attempts, traces and screenshots. Coordinate physical Mac testing with the parent and use its existing slot; no merge/release/deploy/install is part of this plan.
