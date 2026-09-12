const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('wadiDesktop', {
  updateState: () => ipcRenderer.invoke('update-state'),
  checkUpdates: () => ipcRenderer.invoke('update-check'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  updatePlayback: active => ipcRenderer.invoke('update-playback', active),
  onUpdate: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('update-state', listener); return () => ipcRenderer.removeListener('update-state', listener); },
  onOpenSettings: callback => { const listener = () => callback(); ipcRenderer.on('open-settings', listener); return () => ipcRenderer.removeListener('open-settings', listener); },
  openPage: path => ipcRenderer.invoke('open-page', path),
  session: () => ipcRenderer.invoke('session'),
  signIn: () => ipcRenderer.invoke('sign-in'),
  request: (path, options) => ipcRenderer.invoke('api', path, options),
  media: (action, payload) => ipcRenderer.invoke('media', action, payload),
  openExternal: url => ipcRenderer.invoke('external', url),
});
