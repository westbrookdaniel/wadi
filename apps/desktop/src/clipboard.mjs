// A write-only stream-link channel. Never expose clipboard reads or generic IPC.
export function assertTrustedMainFrame(event, window) {
  if (event.sender !== window?.webContents || !event.senderFrame || event.senderFrame !== window.webContents.mainFrame || !event.senderFrame.url.startsWith('wadi://app/')) throw new Error('Untrusted caller');
}

export function registerCopyStreamLink({ ipcMain, clipboard, trusted }) {
  ipcMain.handle('copy-stream-link', (event, ...args) => {
    trusted(event);
    const [value] = args;
    if (args.length !== 1 || typeof value !== 'string' || value.length > 10000 || /[\s\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid stream link');
    let url;
    try { url = new URL(value); } catch { throw new Error('Invalid stream link'); }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('Unsupported stream link');
    // Preserve the original signed query and escaping rather than serializing URL.
    clipboard.writeText(value);
  });
}
