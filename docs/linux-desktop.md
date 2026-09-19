# Linux desktop setup

Use the DEB for Ubuntu/Debian desktop integration. AppImage is portable; it does not install a launcher or icon into the desktop automatically.

## Install and build

Download the Linux amd64 DEB from [Releases](https://github.com/westbrookdaniel/wadi/releases/latest), then install its actual filename:

```bash
sudo apt install ./Wadi-VERSION-linux-amd64.deb
```

Launch Wadi from Applications and pin that entry to your dock. The package installs `wadi.desktop`, matching Electron's desktop identity, and icons at standard sizes. Right-click the DEB launcher for **Open Fullscreen**. F11 toggles fullscreen. The View menu's **Start in Fullscreen** setting persists across launches; on Linux, exit fullscreen and press Alt to reveal the menu. AppImage users can launch `./Wadi-VERSION-linux-x86_64.AppImage --fullscreen`.

To build from source, use Node 24 and pnpm 10.33.2 at the repository root:

```bash
pnpm install --frozen-lockfile
WADI_WEB_ORIGIN=https://watchwadi.com pnpm desktop:package --linux deb AppImage --publish never
pnpm --filter @wadi/desktop test
```

Use your own hosted HTTPS origin when self-hosting accounts. Packaging includes the frontend and media binaries; normal desktop use does not need a local database.

## Optional GPU conversion

The bundled Linux static FFmpeg provides software conversion. Listing a hardware encoder is not proof it works. For compatible Intel/AMD VA-API hardware, install a distro FFmpeg and the appropriate GPU driver. On Ubuntu with Intel graphics:

```bash
sudo apt install ffmpeg vainfo intel-media-va-driver-non-free
vainfo --display drm --device /dev/dri/renderD128
WADI_MEDIA_BIN_DIR=/usr/bin pnpm --filter @wadi/desktop test:vaapi
bash apps/desktop/scripts/setup-linux.sh --vaapi
```

The opt-in test runs the real Wadi streaming service, asserts `h264_vaapi` was used without software fallback, and decodes a generated segment. It requires a working GPU and is not part of generic CI. `WADI_VAAPI_DEVICE` selects another render node if needed. Access to the render device is required; never run Wadi as root to obtain it.

The setup script validates encoding before writing a per-user launcher. It selects `WADI_MEDIA_BIN_DIR` (a directory containing both `ffmpeg` and `ffprobe`) and `WADI_VIDEO_ENCODER=h264_vaapi`. Restart Wadi after setup. Hardware encoding does not imply hardware input decoding or guarantee realtime 4K/HDR conversion. If initialization fails during playback, Wadi can fall back to software. Compatible streams are still copied rather than re-encoded.

## Optional TV startup and Apple mirroring

Run setup as your normal desktop user, not through sudo. Options can be combined:

```bash
sudo apt install uxplay gstreamer1.0-gl gstreamer1.0-pulseaudio
bash apps/desktop/scripts/setup-linux.sh --airplay
# Optional: also start Wadi fullscreen at graphical login.
bash apps/desktop/scripts/setup-linux.sh --autostart
```

UxPlay appears as **Wadi TV** in Apple Control Centre → Screen Mirroring on the same LAN. Ethernet is optional; Wi-Fi works. The user service starts with the graphical session, not at the password screen. Automatic login is not enabled. The receiver accepts clients on the LAN; for access controls, see [UxPlay's PIN/password options](https://github.com/FDH2/UxPlay). DRM-protected video may not mirror. UxPlay is not a Google Cast receiver.

Select the TV audio output in Ubuntu Sound settings. Test picture and sound with an actual phone or Mac; service discovery alone does not verify playback. AP/client isolation can prevent discovery. Do not forward receiver ports to the public internet.

```bash
systemctl --user status uxplay
journalctl --user -u uxplay
```

The AirPlay service targets GNOME/systemd graphical sessions with XWayland/OpenGL and PulseAudio-compatible audio (including PipeWire). Other desktops may need session environment or video-sink adjustments.

## Undo setup

Existing files are backed up once with a `.before-wadi-setup` suffix. Restore those backups if present; otherwise remove only the files created by setup:

- Hardware override: `~/.local/share/applications/wadi.desktop`.
- Wadi startup: `~/.config/autostart/wadi.desktop`.
- AirPlay: run `systemctl --user disable --now uxplay`, remove or restore `~/.config/systemd/user/uxplay.service`, then `systemctl --user daemon-reload`.

The script respects `XDG_DATA_HOME` and `XDG_CONFIG_HOME` when set. It does not alter system power settings, enable automatic login, change sudo permissions or install packages itself.
