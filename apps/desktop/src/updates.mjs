// The main process owns updater state; renderer callers cannot choose feeds or files.
export function createUpdates({ updater, enabled, unavailableReason, notify, feedback, confirmInstall, prepareInstall }) {
  let state = { kind: 'idle' }, busy = false, installing = false;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  const publish = next => { state = next; notify(next); };
  const fail = () => publish({ kind: 'error', message: 'Could not download the update. Check your connection and try again.' });
  updater.on('error', fail);
  updater.on('download-progress', progress => publish({ kind: 'downloading', version: state.version ?? '', percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)) }));
  updater.on('update-downloaded', info => publish({ kind: 'ready', version: info.version }));
  async function check(manual = false) {
    if (!enabled) { if (manual) await feedback(unavailableReason); return state; }
    if (busy) { if (manual) await feedback(state.kind === 'downloading' ? 'An update is downloading in the background.' : 'Wadi is already checking for updates.'); return state; }
    if (state.kind === 'ready') { if (manual) await feedback(`Wadi ${state.version} is ready. Use Restart and update in the sidebar when you are ready.`); return state; }
    busy = true;
    publish({ kind: 'checking' });
    try {
      const result = await updater.checkForUpdates();
      if (!result?.isUpdateAvailable) {
        publish({ kind: 'idle' });
        if (manual) await feedback('You’re up to date.');
      } else {
        publish({ kind: 'downloading', version: result.updateInfo.version, percent: 0 });
        await updater.downloadUpdate();
      }
    } catch { fail(); if (manual) await feedback('Could not check for or download updates. Please try again.'); }
    finally { busy = false; }
    return state;
  }
  async function install() {
    if (state.kind !== 'ready' || installing) return;
    installing = true;
    try {
      if (!await confirmInstall()) return;
      await prepareInstall();
      updater.quitAndInstall(false, true);
    } catch { fail(); }
    finally { installing = false; }
  }
  const launch = enabled ? setTimeout(() => void check(), 10000) : null;
  const periodic = enabled ? setInterval(() => void check(), 6 * 60 * 60 * 1000) : null;
  launch?.unref(); periodic?.unref();
  return { state: () => state, check, install, dispose() { clearTimeout(launch); clearInterval(periodic); } };
}
