export type DesktopBridge = {
  onOpenSettings: (callback: () => void) => () => void
  openPage: (path: '/terms' | '/privacy') => Promise<void>
  session: () => Promise<boolean>
  signIn: () => Promise<boolean>
  request: (path: string, options: { method?: string; body?: unknown }) => Promise<{ status: number; body: unknown }>
  media: (action: 'start' | 'stop' | 'status' | 'resource', payload: unknown) => Promise<unknown>
  openExternal: (url: string) => Promise<void>
}
declare global { interface Window { wadiDesktop?: DesktopBridge } }
export function desktopBridge() { return typeof window === 'undefined' ? undefined : window.wadiDesktop }
