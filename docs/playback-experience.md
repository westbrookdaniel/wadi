# Playback defaults and source controls

Episode rows offer **Play** or **Resume** alongside the existing episode/source selection. **Play recommended source** on a source list uses the viewer's quality, language, size and provider rules without requiring an individual file choice. Settings → **Playback defaults** controls automatic selection, quality limits, recovery, next-episode preparation and watch-progress thresholds.

Signed-in viewers save defaults to their active **profile**, synced across sessions and devices. A profile without saved defaults inherits the existing device defaults until its first explicit save; **Use device defaults** removes the profile override. Existing device preferences are retained. Conversion, external-player defaults, subtitle appearance and title overrides retain their existing device scope. Source/codec reliability and release-family history are scoped to profile and device, because playback support and provider reliability differ between devices.

## Quality and recovery

The built-in player's **Quality & sources** dialog is available on web, desktop and TV. It offers **Auto** and available resolutions that satisfy the profile's automatic-selection rules, plus the complete source list for manual choice. **Auto** ranks sources; it does not continuously adapt to bandwidth. Changing quality switches addon files, briefly reloads playback, and preserves the exact position and pause state. Different edits can have different timelines, audio and subtitle timing. **Buffering? Try a smaller source** chooses an available source with a lower reported resolution or size.

Automatic recovery is on by default. It responds to decoder errors and initial startup exceeding the configured wait limit (30 seconds by default), trying at most two alternate matching sources by default. Each URL is tried once per episode; retry limits are not reset by source switches. Established desktop seeks/conversion are excluded from the startup timeout. Exhaustion provides manual source selection rather than an endless loop. An explicit quality choice limits automatic recovery to that resolution. Opening the source chooser suspends automatic recovery. Source changes and recovery are disabled while casting; the receiver's playback is left intact.

The loading screen distinguishes loading the resume point from preparing/opening playback and offers source selection. Browser autoplay restrictions may still require pressing Play. An HTTP URL alone is never described as guaranteed browser-playable. The browser-friendly preference gives H.264 an advisory ranking bonus; it is not a codec-support probe. No adaptive HLS ladder, web transcoding service, video proxy or new media infrastructure is added.

## Next episodes and learning

With autoplay and preparation enabled, available sources for the immediate released next episode are fetched once near the end of playback, no earlier than halfway through. The preparation window accounts for configured countdown timing. It fetches metadata only, and never opens a second desktop conversion or downloads the next video. The existing cancellable countdown and manual fallback remain available.

Successful playback can prefer the provider's `bingeGroup` release family across a season. The player remembers explicit season opt-outs on this device. Matching families remain subject to quality, size and exclusion rules. Source learning records provider/codec success after ten seconds of advancing playback and failures, with bounded seven-day results; it does not persist stream URLs or filenames. **Clear playback learning** removes this profile's local learning and season choices.

## Deployment and verification

Run the normal schema migration before deploying the API: the additive `user_settings.auto_playback_json` column stores profile defaults. Existing rows default to an empty override, and account exports include the new column. Explicit profile paths check ownership, so a delayed save cannot target a newly selected profile.

Frontend tests cover position/pause preservation, retry bounds, stale decoder errors, startup timeouts, profile cache isolation, late saves, quality selection and next-episode prefetch. API tests use disposable Postgres schemas to verify authentication, ownership, profile/session isolation, validation, reset and account export. The browser QA fixture supports profile-default saves and multiple synthetic resolutions; its sources use the same generated video bytes and do not prove live-provider compatibility.
