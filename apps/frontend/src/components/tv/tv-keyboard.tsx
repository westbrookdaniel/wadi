import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export function TvKeyboard({ target, onClose }: { target: HTMLInputElement | HTMLTextAreaElement; onClose: () => void }) {
  const [value, setValue] = useState(target.value)
  const [upper, setUpper] = useState(false)
  const [symbols, setSymbols] = useState(target.type === 'number')
  const [error, setError] = useState('')
  const label = target.getAttribute('aria-label') ?? target.labels?.[0]?.textContent?.trim() ?? target.placeholder ?? 'Enter text'
  const rows = symbols ? ['1234567890', '@._-:/?#&=', '!$%+*,;()', '[]{}<>^~|', '\\`"\''] : ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
  const insert = (text: string) => setValue(current => (current + text).slice(0, target.maxLength < 0 ? undefined : target.maxLength))
  const commit = () => {
    if (!target.isConnected || target.matches(':disabled') || target.readOnly) { onClose(); return }
    if (target.type === 'number' && value !== '' && !Number.isFinite(Number(value))) { setError('Enter a number.'); return }
    const draft = target.cloneNode() as HTMLInputElement | HTMLTextAreaElement
    draft.value = value
    if (!draft.checkValidity()) { setError(draft.validationMessage); return }
    const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(target, value)
    target.dispatchEvent(new Event('input', { bubbles: true }))
    target.dispatchEvent(new Event('change', { bubbles: true }))
    onClose()
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="tv-keyboard" data-tv-keyboard onKeyDown={event => {
      if (event.target instanceof HTMLInputElement || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key.length === 1) { event.preventDefault(); insert(event.key) }
      if (event.key === 'Backspace') { event.preventDefault(); setValue(current => current.slice(0, -1)) }
    }} onOpenAutoFocus={event => {
      event.preventDefault(); document.querySelector<HTMLElement>('[data-tv-keyboard] [data-tv-key]')?.focus()
    }} onCloseAutoFocus={event => { event.preventDefault(); if (target.isConnected) target.focus() }}>
      <DialogTitle>{label}</DialogTitle>
      <DialogDescription>Use the on-screen keys or type with your keyboard. Done applies; Back cancels.</DialogDescription>
      <input aria-label={`Edit ${label}`} type={target.type === 'password' ? 'password' : 'text'} inputMode="none"
        value={value} maxLength={target.maxLength < 0 ? undefined : target.maxLength} onChange={event => setValue(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit() } }} />
      <div className="tv-keyboard-keys">
        {rows.map(row => <div className="tv-keyboard-row" data-tv-region={row} key={row}>
          {[...row].map(key => <button type="button" data-tv-key key={key} onClick={() => insert(upper ? key.toUpperCase() : key)}>{upper ? key.toUpperCase() : key}</button>)}
        </div>)}
        <div className="tv-keyboard-actions" data-tv-region="keyboard-actions">
          <button type="button" aria-pressed={upper} onClick={() => setUpper(!upper)}>Shift</button>
          <button type="button" onClick={() => setSymbols(!symbols)}>{symbols ? 'ABC' : '123 / @'}</button>
          <button type="button" onClick={() => insert(' ')}>Space</button>
          <button type="button" onClick={() => setValue(current => current.slice(0, -1))}>Delete</button>
          <button type="button" onClick={() => setValue('')}>Clear</button>
        </div>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <div className="tv-keyboard-actions"><button type="button" onClick={onClose}>Cancel</button><button type="button" className="tv-primary" onClick={commit}>Done</button></div>
    </DialogContent>
  </Dialog>
}
