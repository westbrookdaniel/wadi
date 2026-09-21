import { useState, Children, isValidElement, type ComponentProps, type ReactNode } from 'react'
import { useDeviceStore } from '@/store/device-store'
import { TvPicker, type TvOption } from '@/components/tv/tv-picker'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SettingsSelect({ className, onValueChange, children, ...props }: Omit<ComponentProps<'select'>, 'onChange'> & { onValueChange: (value: string) => void }) {
  const tvMode = useDeviceStore(state => state.tvMode)
  const [localValue, setLocalValue] = useState(props.defaultValue ?? '')
  if (tvMode) return <TvPicker id={props.id} label={props['aria-label'] ?? props.id?.replace(/[-_]/g, ' ') ?? 'Choose an option'}
    className={className} describedBy={props['aria-describedby']} value={String(props.value ?? localValue)}
    options={readOptions(children)} disabled={props.disabled} onChange={value => { setLocalValue(value); onValueChange(value) }} />
  return <span className={cn('relative block min-w-0 w-full', className)}>
    <select {...props} onChange={event => onValueChange(event.target.value)} className="h-10 w-full min-w-0 appearance-none truncate rounded-lg border border-input bg-background px-3 pr-9 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50">{children}</select>
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
  </span>
}

function readOptions(children: ReactNode, disabled = false): TvOption[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)) return []
    if (child.type === 'option') return [{ value: String(child.props.value ?? child.props.children ?? ''), label: Children.toArray(child.props.children).join(''), disabled: disabled || child.props.disabled }]
    return readOptions(child.props.children, disabled || child.props.disabled)
  })
}
