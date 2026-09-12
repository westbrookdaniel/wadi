export function newerVersion(candidate, current) {
  const parse = value => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value)?.slice(1).map(Number);
  const a = parse(candidate), b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
export function releaseDownload(release, repository, platform, arch) {
  const prefix = `https://github.com/${repository}/releases/`;
  const os = { darwin: 'mac', win32: 'win', linux: 'linux' }[platform];
  const extension = { darwin: '.dmg', win32: '.exe', linux: '.AppImage' }[platform];
  const assetArch = platform === 'linux' && arch === 'x64' ? 'x86_64' : arch;
  const asset = release.assets?.find(asset => typeof asset.name === 'string' && asset.name.endsWith(`-${os}-${assetArch}${extension}`) && typeof asset.browser_download_url === 'string' && asset.browser_download_url.startsWith(`${prefix}download/`));
  return asset?.browser_download_url ?? `https://github.com/${repository}/releases/latest`;
}
// Only checks release metadata. Installation remains under the user's control.
export function createUpdates({ repository, currentVersion, platform, arch, enabled, notify, feedback, openDownload, fetchRelease = async () => {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Release check failed');
  return response.json();
} }) {
  if (!/^[\w-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid release repository');
  let state = { kind: 'idle' }, busy = false, downloadURL;
  const publish = next => { state = next; notify(next); };
  async function check(manual = false) {
    if (!enabled) { if (manual) await feedback('Update checks are available in installed Wadi releases.'); return state; }
    if (busy) return state;
    busy = true;
    publish({ kind: 'checking' });
    try {
      const release = await fetchRelease();
      if (release && !release.draft && !release.prerelease && newerVersion(release.tag_name, currentVersion)) {
        downloadURL = releaseDownload(release, repository, platform, arch);
        publish({ kind: 'available', version: release.tag_name.replace(/^v/, '') });
        if (manual) await feedback(`Wadi ${state.version} is available. Use Download update in the sidebar to get the installer.`);
      } else { downloadURL = undefined; publish({ kind: 'idle' }); if (manual) await feedback('You’re up to date.'); }
    } catch { publish({ kind: 'error', message: 'Could not check for updates. Please try again.' }); if (manual) await feedback(state.message); }
    finally { busy = false; }
    return state;
  }
  async function download() {
    if (state.kind !== 'available' || !downloadURL) return;
    try { await openDownload(downloadURL); }
    catch { await feedback('Could not open the download. Visit GitHub Releases in your browser.'); }
  }
  const launch = enabled ? setTimeout(() => void check(), 10000) : null;
  const periodic = enabled ? setInterval(() => void check(), 6 * 60 * 60 * 1000) : null;
  launch?.unref(); periodic?.unref();
  return { state: () => state, check, download, dispose() { clearTimeout(launch); clearInterval(periodic); } };
}
