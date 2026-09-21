import { useId, useRef, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export type TvOption = { value: string; label: ReactNode; disabled?: boolean }

/** A picker is entered with OK. Moving onto its trigger never changes its value. */
export function TvPicker({ label, value, options, onChange, disabled, id, describedBy, className, placeholder, displayValue }: {
  label: string; value: string; options: TvOption[]; onChange: (value: string) => void
  disabled?: boolean; id?: string; describedBy?: string; className?: string; placeholder?: ReactNode; displayValue?: ReactNode
}) {
  const optionsId = useId()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const [title, setTitle] = useState(label)
  const selected = options.find(option => option.value === value)
  return <>
    <button ref={trigger} id={id} type="button" className={["tv-choice", className].filter(Boolean).join(" ")} aria-label={label}
      aria-describedby={describedBy} aria-haspopup="dialog" aria-expanded={open}
      disabled={disabled} onClick={() => {
        const associated = trigger.current?.labels?.[0]
        setTitle(associated?.textContent?.replace(trigger.current?.textContent ?? '', '').trim() || label)
        setOpen(true)
      }}>
      <span><small className="tv-choice-label">{label}</small>{displayValue ?? selected?.label ?? placeholder ?? 'Choose…'}</span><span aria-hidden="true">⌄</span>
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="tv-picker" onOpenAutoFocus={event => {
        event.preventDefault()
        const panel = document.getElementById(optionsId)
        const option = (panel?.querySelector<HTMLElement>('[aria-pressed="true"]:not(:disabled)') ?? panel?.querySelector<HTMLElement>('button:not(:disabled)'))
        option?.focus()
        option?.scrollIntoView({ block: 'nearest' })
      }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Choose with OK. Back cancels.</DialogDescription>
        <div id={optionsId} className="tv-options" data-tv-region="options">
          {options.map(option => <button type="button" key={option.value} disabled={option.disabled}
            aria-pressed={option.value === value} onClick={() => { onChange(option.value); setOpen(false) }}>
            <span>{option.label}</span>{option.value === value ? <span aria-hidden="true">✓</span> : null}
          </button>)}
        </div>
      </DialogContent>
    </Dialog>
  </>
}
