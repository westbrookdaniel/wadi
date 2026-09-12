import { desktopBridge } from '@/lib/desktop'
export function DesktopDownload({ corner = false }: { corner?: boolean }) {
  const url = process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL || '/desktop/download'
  if (desktopBridge()) return null
  return <a href={url} className={corner ? 'fixed right-4 top-4 z-30 rounded-full border border-white/15 bg-black/65 px-4 py-2 text-xs text-white/80 backdrop-blur hover:text-white' : 'text-sm underline underline-offset-4'}>Get desktop app</a>
}
