import { Monitor } from 'lucide-react'
import { desktopBridge } from '@/lib/desktop'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
export function DesktopDownload({ sidebar = false }: { sidebar?: boolean }) {
  const url = process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL || '/desktop/download'
  if (desktopBridge()) return null
  if (!sidebar) return <a href={url} className="text-sm underline underline-offset-4">Get desktop app</a>
  return <Tooltip>
    <TooltipTrigger asChild><a href={url} aria-label="Get desktop app" className="absolute bottom-5 left-1/2 grid size-12 -translate-x-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring max-[800px]:hidden"><Monitor className="size-6" aria-hidden="true" /></a></TooltipTrigger>
    <TooltipContent side="top" align="start" sideOffset={12} className="grid max-w-64 gap-1 p-3">
      <strong className="text-sm font-medium">Get desktop app</strong>
      <span className="text-xs leading-relaxed opacity-80">Play more video and audio formats with conversion on your device, while keeping your library in sync.</span>
    </TooltipContent>
  </Tooltip>
}
