import { useDeviceStore } from '@/store/device-store'
import { useEffect, useState } from 'react'
import { router } from '@/router'
import { useAppStore } from '@/store/app-store'
import { desktopBridge } from '@/lib/desktop'
import { isShortcutBlocked, toggleAppFullscreen } from '@/lib/keyboard'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast-context'

export function AppKeyboardShortcuts() {
  const [open, setOpen] = useState(false)
  const token = useAppStore(state => state.token)
  const { toast } = useToast()
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (useDeviceStore.getState().tvMode) return
      if (isShortcutBlocked(event) || event.repeat || event.altKey) return
      const key = event.key.toLowerCase()
      if (event.shiftKey && key !== '?') return
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && key !== 'k' && key !== ',') return
      if (event.metaKey && key === ',' && desktopBridge()) return // Native application menu owns Cmd+,.
      if (!modifier && key === 'f') {
        event.preventDefault()
        void toggleAppFullscreen().catch(() => toast({ title: 'Fullscreen is unavailable in this browser.' }))
      } else if (!modifier && key === '?') {
        event.preventDefault(); setOpen(true)
      } else if (token && (key === '/' && !modifier || key === 'k' && modifier)) {
        event.preventDefault()
        void router.navigate({ to: '/search' }).then(() => {
          requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[type="search"]')?.focus())
        })
      } else if (token && key === ',' && modifier) {
        event.preventDefault(); void router.navigate({ to: '/settings' })
      } else if (token && key === 'h' && !modifier) {
        event.preventDefault(); void router.navigate({ to: '/home' })
      }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [token, toast])
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent className={typeof document !== 'undefined' && document.querySelector('.player-viewport') ? 'dark' : undefined}>
      <DialogTitle>Keyboard shortcuts</DialogTitle>
      <dl className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3 text-sm">
        {[
          ['Fullscreen', 'F'], ['Search', '/ or ⌘ / Ctrl K'], ['Home', 'H'],
          ['Settings', '⌘ / Ctrl ,'], ['Keyboard shortcuts', '?'],
          ['Play / pause', 'Space or K'], ['Seek 5 seconds', '← / →'],
          ['Seek 10 seconds', 'J / L'], ['Volume', '↑ / ↓'], ['Mute', 'M'],
          ['Playback speed', ', / .'],
        ].map(([label, keys]) => <div key={label} className="contents"><dt>{label}</dt><dd className="text-right"><kbd className="rounded border border-border bg-muted px-2 py-1 text-xs">{keys}</kbd></dd></div>)}
      </dl>
    </DialogContent>
  </Dialog>
}
