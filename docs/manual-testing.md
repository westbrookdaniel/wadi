# User testing checklist

This revision has not been built or tested by the implementing agent, as requested. Use a disposable Postgres database and ordinary test media first.

## Hosted API and data

- Apply the schema and create an account, then login/logout and reconnect desktop through the browser.
- Import a copy of the old SQLite database into an empty Postgres database. Check profiles, addons, lists, settings and resume positions.
- Confirm different users/profiles cannot access one another's data. Delete/select profiles and reorder addons.
- Try expired, replayed and incorrect-verifier desktop sign-in codes. Only a fresh matching code should establish a session.
- Inspect the packaged desktop files: no DATABASE_URL, server auth code, SQLite database or plaintext session token.
- Quit/relaunch with the OS keyring locked/unlocked. Confirm logout invalidates the hosted session.
- Stop the API temporarily and confirm a retry works after it returns.

## Desktop media

- Try H.264/AAC, H.264/DTS or AC-3, and a source needing video conversion.
- Confirm initial playback starts before the source finishes downloading. Observe audio-only conversion copying video.
- Seek well ahead and back, change audio tracks, change playback rate, pause for several minutes, then resume.
- Check A/V synchronization, duration, saved position and subtitles after each change.
- Try rapid seeks/back navigation while the first session is preparing. Confirm no orphan FFmpeg processes remain after closing the app.
- Try a source requiring provider headers. Verify no app bearer token reaches the provider.
- Check cache growth and a high-bitrate source; confirm bounded storage and useful failure messaging.
- Try software fallback on a machine without supported hardware encoding.
- Check TV keyboard/controller navigation and fullscreen.

## Web and external playback

- Try direct browser-compatible media and a provider without CORS. The latter should offer desktop/external/copy options.
- In browser network tools, confirm video bytes go to the provider, never `/api/stream-proxy` or `/api/conversions`.
- Check every external-player preset on its listed platform with the app installed, plus an absent app.
- Download/open an M3U. Switch presets and confirm the custom template is preserved.
- Save custom settings, reload, and verify they are shared with desktop through Postgres.
- Check the corner download link and direct web Chromecast playback.

## Packaging

- Build/install Windows, macOS and Linux packages on their target architectures.
- Verify browser sign-in callbacks on each OS, native FFmpeg availability, OS keyring behavior and app shutdown.
- Configure signing/notarization and verify installed trust before publishing.
- If enabling updates, publish a newer signed package and its metadata to a staging feed first.
