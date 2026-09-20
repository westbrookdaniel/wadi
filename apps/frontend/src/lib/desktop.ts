export type DesktopUpdate = { kind: 'idle' } | { kind: 'checking' } | { kind: 'available'; version: string } | { kind: 'error'; message: string }
export type DesktopBridge = {
  appVersion: () => Promise<string>
  getStartFullscreen: () => Promise<boolean>
  setStartFullscreen: (value: boolean) => Promise<boolean>
  onStartFullscreenChanged: (callback: (value: boolean) => void) => () => void
  updateState: () => Promise<DesktopUpdate>
  checkUpdates: () => Promise<DesktopUpdate>
  downloadUpdate: () => Promise<void>
  onUpdate: (callback: (state: DesktopUpdate) => void) => () => void
  onOpenSettings: (callback: () => void) => () => void
  openPage: (path: '/terms' | '/privacy') => Promise<void>
  session: () => Promise<boolean>
  signIn: () => Promise<boolean>
  request: (path: string, options: { method?: string; body?: unknown }) => Promise<{ status: number; body: unknown }>
  media: (action: 'start' | 'stop' | 'status' | 'progress' | 'resource', payload: unknown) => Promise<unknown>
  openExternal: (url: string) => Promise<void>
}
declare global { interface Window { wadiDesktop?: DesktopBridge } }
export function desktopBridge() { return typeof window === 'undefined' ? undefined : window.wadiDesktop }
