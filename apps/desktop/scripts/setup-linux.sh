#!/usr/bin/env bash
# Run as the desktop user, after installing the Wadi DEB.
set -euo pipefail
vaapi=false airplay=false autostart=false
for arg in "$@"; do
  case "$arg" in
    --vaapi) vaapi=true ;;
    --airplay) airplay=true ;;
    --autostart) autostart=true ;;
    *) echo 'Usage: setup-linux.sh [--vaapi] [--airplay] [--autostart]' >&2; exit 2 ;;
  esac
done
[[ $(uname -s) == Linux && $EUID != 0 ]] || { echo 'Run as your Linux desktop user, without sudo.' >&2; exit 1; }
[[ -x /opt/Wadi/wadi && -f /usr/share/applications/wadi.desktop ]] || { echo 'Install the Wadi DEB first.' >&2; exit 1; }
command -v python3 >/dev/null
if $vaapi; then
  command -v ffmpeg >/dev/null
  command -v ffprobe >/dev/null
  # Fail before changing launchers if the GPU or driver cannot encode.
  ffmpeg -v error -vaapi_device "${WADI_VAAPI_DEVICE:-/dev/dri/renderD128}" \
    -f lavfi -i testsrc2=size=640x360:rate=30 -frames:v 30 \
    -vf format=nv12,hwupload -c:v h264_vaapi -f null -
fi
if $airplay; then
  command -v uxplay >/dev/null
  systemctl --user show-environment >/dev/null
fi
export WADI_SETUP_VAAPI=$vaapi WADI_SETUP_AUTOSTART=$autostart
python3 - <<'PY'
import os, shutil
from pathlib import Path
config=Path(os.environ.get('XDG_CONFIG_HOME',Path.home()/'.config'))
data=Path(os.environ.get('XDG_DATA_HOME',Path.home()/'.local/share'))
source=Path('/usr/share/applications/wadi.desktop').read_text()
def save(path, text):
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists() and not Path(str(path)+'.before-wadi-setup').exists():
        shutil.copy2(path, str(path)+'.before-wadi-setup')
    path.write_text(text)
if os.environ['WADI_SETUP_VAAPI']=='true':
    # The distro pair must be in one directory; no hard-coded user paths.
    ffmpeg=Path(shutil.which('ffmpeg')).parent
    if Path(shutil.which('ffprobe')).parent != ffmpeg:
        raise SystemExit('ffmpeg and ffprobe must be in the same directory')
    def quote(value):
        return '"'+str(value).replace('\\','\\\\').replace('"','\\"').replace('`','\\`').replace('$','\\$').replace('%','%%')+'"'
    prefix='env '+quote('WADI_MEDIA_BIN_DIR='+str(ffmpeg))+' WADI_VIDEO_ENCODER=h264_vaapi '+quote('WADI_VAAPI_DEVICE='+os.environ.get('WADI_VAAPI_DEVICE','/dev/dri/renderD128'))+' '
    source='\n'.join('Exec='+prefix+line[5:] if line.startswith('Exec=') else line for line in source.splitlines())+'\n'
    save(data/'applications/wadi.desktop',source)
if os.environ['WADI_SETUP_AUTOSTART']=='true':
    launcher=data/'applications/wadi.desktop'
    if launcher.exists(): source=launcher.read_text()
    # Reuse only the primary launch command, preserving any hardware override.
    main=source.split('[Desktop Action',1)[0]
    command=next(line[5:] for line in main.splitlines() if line.startswith('Exec='))
    command=command.replace(' %U','').replace(' %u','')
    save(config/'autostart/wadi.desktop','[Desktop Entry]\nType=Application\nName=Wadi\nIcon=wadi\nExec='+command+' --fullscreen\n')
PY
if $airplay; then
  unit="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/uxplay.service"
  mkdir -p "$(dirname "$unit")"
  if [[ -f "$unit" && ! -f "$unit.before-wadi-setup" ]]; then cp "$unit" "$unit.before-wadi-setup"; fi
  cat > "$unit" <<'UNIT'
[Unit]
Description=Wadi TV AirPlay receiver
After=graphical-session.target
PartOf=graphical-session.target
[Service]
ExecStart=/usr/bin/uxplay -n "Wadi TV" -nh -fs -vs glimagesink -as pulsesink -scrsv 1
Restart=on-failure
RestartSec=5
[Install]
WantedBy=graphical-session.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable uxplay
  if systemctl --user is-active --quiet graphical-session.target; then systemctl --user restart uxplay; fi
fi
if command -v update-desktop-database >/dev/null && [[ -d "${XDG_DATA_HOME:-$HOME/.local/share}/applications" ]]; then update-desktop-database "${XDG_DATA_HOME:-$HOME/.local/share}/applications"; fi
printf 'Setup complete. Changes apply on the next Wadi launch.\n'
