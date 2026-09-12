const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('wadiDesktop', {
  openPage: path => ipcRenderer.invoke('open-page', path),
  session: () => ipcRenderer.invoke('session'),
  signIn: () => ipcRenderer.invoke('sign-in'),
  request: (path, options) => ipcRenderer.invoke('api', path, options),
  media: (action, payload) => ipcRenderer.invoke('media', action, payload),
  openExternal: url => ipcRenderer.invoke('external', url),
});
