import type { ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SettingsSelect({ className, onValueChange, children, ...props }: Omit<ComponentProps<'select'>, 'onChange'> & { onValueChange: (value: string) => void }) {
  return <span className={cn('relative block min-w-0 w-full', className)}>
    <select {...props} onChange={event => onValueChange(event.target.value)} className="h-10 w-full min-w-0 appearance-none truncate rounded-lg border border-input bg-background px-3 pr-9 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50">{children}</select>
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
  </span>
}
