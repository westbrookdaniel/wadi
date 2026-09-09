import { nearestTarget } from './tv-spatial'
import { useEffect } from 'react'
import { useDeviceStore } from '@/store/device-store'

const selector = 'a[href], button, input, select, textarea, [tabindex], [role="slider"]'
const widget = 'select, [role="menu"], [role="listbox"]'

export function TvNavigation() {
  const enabled = useDeviceStore(state => state.tvMode)
  useEffect(() => {
    document.documentElement.classList.toggle('tv-mode', enabled)
    if (!enabled) return
    const targets = () => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')].filter(el => el.getClientRects().length)
      const scope = dialogs.at(-1) ?? document
      return [...scope.querySelectorAll<HTMLElement>(selector)].filter(el => {
        const style = getComputedStyle(el)
        return el.tabIndex >= 0 && !el.matches(':disabled, [aria-disabled="true"]') && !el.closest('[inert], [aria-hidden="true"]') && el.getClientRects().length && style.visibility !== 'hidden' && style.display !== 'none'
      })
    }
    const focus = (el?: HTMLElement) => { el?.focus({ preventScroll: true }); el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }) }
    const repair = () => { if (!document.activeElement || document.activeElement === document.body) focus(targets()[0]) }
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const active = document.activeElement
      if (active instanceof HTMLElement && active.closest(widget)) return
      if (event.key === 'Escape' && document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return
      const editing = active instanceof HTMLElement && active.matches('input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable="true"], [role="slider"]')
      if (editing && event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Escape') return
      if (editing && event.key === 'Escape') {
        focus(nearestTarget(active.getBoundingClientRect(), targets().filter(el => el !== active), 'ArrowUp'))
        event.preventDefault(); return
      }
      if (event.key === 'Enter' && active instanceof HTMLInputElement && active.type === 'checkbox') { active.click(); event.preventDefault(); return }
      if (event.key === 'Escape' || event.key === 'BrowserBack') {
        if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return
        const back = [...document.querySelectorAll<HTMLElement>('button')].find(el => /^back/i.test(el.getAttribute('aria-label') ?? el.textContent ?? ''))
        if (back) back.click(); else window.history.back()
        event.preventDefault(); return
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      const items = targets()
      const next = active instanceof HTMLElement && items.includes(active) ? nearestTarget(active.getBoundingClientRect(), items.filter(el => el !== active), event.key) : items[0]
      focus(next)
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    document.addEventListener('keydown', onKey, true)
    const observer = new MutationObserver(repair)
    observer.observe(document.body, { childList: true, subtree: true })
    repair()
    let frame = 0, previous = '', nextRepeat = 0
    const poll = (time: number) => {
      const pad = navigator.getGamepads?.().find(value => value?.connected && value.mapping === 'standard')
      let key = ''
      if (pad) {
        if (pad.buttons[0]?.pressed) key = 'Enter'
        else if (pad.buttons[1]?.pressed) key = 'Escape'
        else if (pad.buttons[12]?.pressed || pad.axes[1] < -0.6) key = 'ArrowUp'
        else if (pad.buttons[13]?.pressed || pad.axes[1] > 0.6) key = 'ArrowDown'
        else if (pad.buttons[14]?.pressed || pad.axes[0] < -0.6) key = 'ArrowLeft'
        else if (pad.buttons[15]?.pressed || pad.axes[0] > 0.6) key = 'ArrowRight'
      }
      if (!document.hidden && key && (key !== previous || key.startsWith('Arrow') && time >= nextRepeat)) {
        const target = document.activeElement ?? document.body
        const event = new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true })
        target.dispatchEvent(event)
        if (key === 'Enter' && !event.defaultPrevented && target instanceof HTMLElement) target.click()
        target.dispatchEvent(new KeyboardEvent('keyup', { key, code: key, bubbles: true }))
        nextRepeat = time + (key === previous ? 160 : 400)
      }
      previous = key
      frame = requestAnimationFrame(poll)
    }
    frame = requestAnimationFrame(poll)
    return () => { document.documentElement.classList.remove('tv-mode'); observer.disconnect(); document.removeEventListener('keydown', onKey, true); cancelAnimationFrame(frame) }
  }, [enabled])
  return null
}
