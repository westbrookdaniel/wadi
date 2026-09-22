# Skip prompts and settings search QA — 2026-09-22

- Desktop and TV render Skip and secondary Dismiss buttons in an overlay separate from ordinary playback controls. A ten-second wall-clock timer dismisses the prompt even while paused; mouse movement and equivalent timestamp rerenders do not extend it. Leaving and re-entering a segment starts a new offer.
- Desktop skip prompts no longer pin the ordinary controls. TV controls retain their four-second idle timeout, focus moves to the remaining prompt, and Up/Down reveals playback controls. Back dismisses visible overlays before exiting. Expiry and dismissal recover TV focus without seeking.
- Settings search indexes rendered labels and descriptions, including hidden TV sections and collapsed experimental settings. Results focus/scroll to their setting and open enclosing details; Account and Plugins results navigate to their dedicated pages. Enter selects the first result and Escape clears search.
- IntroDB preference uses the existing standard checkbox styling. It still saves automatically and displays failures, without a saving/success status message.
- Regression suite covers 174 frontend tests, including timeout boundaries, equivalent rerenders, no seek on dismissal, TV focus and remote activation, search navigation/expansion, empty search results, keyboard operation and checkbox saves. ESLint and TypeScript pass. Production Next.js and desktop renderer builds pass.
- No release, production database changes or installed-app upgrade is part of this PR. Physical remote and real-stream playback were not tested.
