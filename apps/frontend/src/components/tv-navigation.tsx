import { nearestTarget } from './tv-spatial'
import { useEffect, useState } from 'react'
import { useDeviceStore } from '@/store/device-store'
import { TvKeyboard } from './tv/tv-keyboard'
import { isTextEntry } from './tv/text-entry'

const selector = 'a[href], button, input, select, textarea, summary, [tabindex], [role="slider"]'
const memories = new Map<string, { key: string; region: string | undefined }>()

function visible(element: HTMLElement) {
  const style = getComputedStyle(element)
  const closedDetails = element.closest('details:not([open])')
  return element.tabIndex >= 0 && !element.matches(':disabled, [aria-disabled="true"]') &&
    !element.closest('[inert], [aria-hidden="true"], [hidden]') && element.getClientRects().length > 0 &&
    style.visibility !== 'hidden' && style.display !== 'none' &&
    (!closedDetails || Boolean(element.closest('summary')))
}
function regionIdentity(element: HTMLElement) {
  const region = element.closest<HTMLElement>('[data-tv-region]')
  const section = region?.closest('section')
  return region ? `${region.dataset.tvRegion}:${section?.getAttribute('aria-label') ?? section?.querySelector('h2')?.textContent ?? ''}` : undefined
}
function keyFor(element: HTMLElement) {
  return element.dataset.tvFocusKey ?? element.id ?? ''
}
function identity(element: HTMLElement) {
  return keyFor(element) || element.getAttribute('aria-label') || element.textContent?.trim() || element.getAttribute('name') || ''
}
function focus(element?: HTMLElement) {
  element?.focus({ preventScroll: true })
  element?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
}

/** One input owner, scoped overlays and route/region focus memory. No platform APIs. */
export function TvNavigation() {
  const enabled = useDeviceStore(state => state.tvMode)
  const [editing, setEditing] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null)
  useEffect(() => {
    document.documentElement.classList.toggle('tv-mode', enabled)
    if (!enabled) return
    const scope = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')]
      .filter(element => element.getClientRects().length && !element.closest('[hidden], [aria-hidden="true"]') && element.dataset.state !== 'closed').at(-1) ?? document
    const inputModes = new Map<HTMLElement, string | null>()
    const targets = (root: ParentNode = scope()) => [...root.querySelectorAll<HTMLElement>(selector)].filter(element => {
      if (isTextEntry(element) && !inputModes.has(element)) {
        inputModes.set(element, element.getAttribute('inputmode'))
        element.setAttribute('inputmode', 'none')
      }
      return visible(element)
    })
    const pageKey = () => (document.querySelector<HTMLElement>('[data-tv-page]')?.dataset.tvPage ?? `unscoped:${window.location.pathname}`) + ':' + (document.querySelector<HTMLElement>('[data-tv-focus-scope]')?.dataset.tvFocusScope ?? '')
    const regionMemory = new WeakMap<HTMLElement, HTMLElement>()
    let page = pageKey()
    let arriving = true
    let lastRegion: HTMLElement | null = null
    let lastIndex = 0
    let adjusting: HTMLInputElement | null = null
    const remember = (event: FocusEvent) => {
      const element = event.target
      if (!(element instanceof HTMLElement)) return
      if (adjusting && element !== adjusting) { adjusting.setAttribute('aria-description', 'OK to adjust.'); adjusting = null }
      if (scope() !== document) return
      const region = element.closest<HTMLElement>('[data-tv-region]')
      if (region) regionMemory.set(region, element)
      lastRegion = region
      lastIndex = targets(region ?? document).indexOf(element)
      if (!element.closest('nav') && !arriving) {
        memories.set(page, { key: identity(element), region: regionIdentity(element) })
        if (memories.size > 100) memories.delete(memories.keys().next().value!)
      }
    }
    const repair = () => {
      for (const element of inputModes.keys()) { if (!element.isConnected) inputModes.delete(element) }
      const nextPage = pageKey()
      if (page !== nextPage) { page = nextPage; arriving = true; lastRegion = null }
      const root = scope()
      const items = targets(root)
      const active = document.activeElement
      if (root === document && arriving) {
        const main = document.querySelector('[data-tv-page]')
        const entry = main?.querySelector('[data-tv-entry]') ?? main
        const loading = entry?.querySelector('[data-tv-loading]')
        const content = entry && !loading ? targets(entry).filter(item => !item.closest('[data-tv-loading]')) : []
        const memory = memories.get(page)
        const restored = memory && content.find(item => identity(item) === memory.key && regionIdentity(item) === memory.region)
        const preferred = content.find(item => item.hasAttribute('data-tv-default'))
        const next = restored || preferred || content[0]
        if (next) { arriving = false; focus(next); return }
      }
      if (!(active instanceof HTMLElement) || !items.includes(active)) {
        const regionItems = lastRegion?.isConnected && (root === document || root.contains(lastRegion)) ? targets(lastRegion).filter(item => items.includes(item)) : []
        focus(regionItems[Math.min(lastIndex, regionItems.length - 1)] ?? items.find(item => item.hasAttribute('data-tv-default')) ?? items[0])
      }
    }
    const stop = (event: KeyboardEvent) => { event.preventDefault(); event.stopImmediatePropagation() }
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
      const active = document.activeElement
      const root = scope()
      // Custom Radix menus own arrows only while OPEN, never at their trigger.
      if (['Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) arriving = false
      const isBack = event.key === 'Escape' || event.key === 'BrowserBack'
      if (event.repeat && (isBack || event.key === 'Enter')) { stop(event); return }
      if (isBack && adjusting === active && adjusting) {
        adjusting.setAttribute('aria-description', 'OK to adjust.'); adjusting = null; stop(event); return
      }
      if (isBack && root !== document) {
        if (event.key === 'BrowserBack') {
          stop(event); active?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
        }
        return
      }
      if (active instanceof HTMLElement && active.closest('[role="menu"], [role="listbox"]')) return
      // The player owns its idle/controls/seeking states; modal dialogs remain global.
      if (root === document && document.querySelector('[data-tv-player]')) return
      if (active instanceof HTMLElement && active.closest('[data-tv-keyboard]') && isTextEntry(active)) {
        if (!event.key.startsWith('Arrow')) return
      } else if (active instanceof HTMLElement && isTextEntry(active) && event.key === 'Enter') {
        stop(event); setEditing(active); return
      }
      if (active instanceof HTMLInputElement && active.type === 'range') {
        if (event.key === 'Enter' || isBack && adjusting === active) {
          adjusting = adjusting === active ? null : active
          active.setAttribute('aria-description', adjusting ? 'Left and right adjust. OK or Back finishes.' : 'OK to adjust.')
          stop(event); return
        }
        if (adjusting === active && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
          const value = Math.max(Number(active.min || 0), Math.min(Number(active.max || 100), Number(active.value) + (event.key === 'ArrowLeft' ? -1 : 1) * Number(active.step || 1)))
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(active, String(value))
          active.dispatchEvent(new Event('input', { bubbles: true })); active.dispatchEvent(new Event('change', { bubbles: true }))
          stop(event); return
        }
      }
      if (event.key === 'Enter' && active instanceof HTMLElement && !active.closest('[data-tv-keyboard] input')) {
        stop(event); if (!event.repeat) active.click(); return
      }
      if (isBack) {
        stop(event)
        const back = targets().find(element => element.hasAttribute('data-tv-back')) ?? targets().find(element => /^back/i.test(element.getAttribute('aria-label') ?? element.textContent ?? ''))
        if (back) back.click()
        else {
          const home = document.querySelector<HTMLElement>('[data-tv-home]')
          if (home) home.click()
          else if (window.history.length > 1) window.history.back()
        }
        return
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      const items = targets()
      const region = active instanceof HTMLElement ? active.closest<HTMLElement>('[data-tv-region]') : null
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
      const local = horizontal && region ? targets(region).filter(item => item !== active) : []
      const origin = active instanceof HTMLElement && items.includes(active) ? active.getBoundingClientRect() : null
      const inRow = horizontal && region?.dataset.tvRegion === 'media-row'
      const fallback = inRow ? (event.key === 'ArrowLeft' ? items.filter(item => item.closest('.tv-rail')) : []) : items.filter(item => item !== active)
      let next = origin ? nearestTarget(origin, local, event.key) ?? nearestTarget(origin, fallback, event.key) : items[0]
      const nextRegion = next?.closest<HTMLElement>('[data-tv-region]')
      const remembered = nextRegion ? regionMemory.get(nextRegion) : undefined
      if (!horizontal && nextRegion !== region && remembered && visible(remembered)) next = remembered
      focus(next)
      stop(event)
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && isTextEntry(target) && !target.closest('[data-tv-keyboard]')) {
        event.preventDefault(); event.stopPropagation(); setEditing(target)
      }
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('focusin', remember)
    let repairFrame = 0
    const observer = new MutationObserver(() => { cancelAnimationFrame(repairFrame); repairFrame = requestAnimationFrame(repair) })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tv-page', 'data-tv-focus-scope', 'data-tv-loading', 'disabled', 'aria-disabled', 'hidden', 'aria-hidden', 'data-state', 'open'] })
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
    return () => {
      document.documentElement.classList.remove('tv-mode'); observer.disconnect()
      for (const [element, mode] of inputModes) { if (mode === null) element.removeAttribute('inputmode'); else element.setAttribute('inputmode', mode) }
      document.removeEventListener('keydown', onKey, true); document.removeEventListener('click', onClick, true)
      document.removeEventListener('focusin', remember); cancelAnimationFrame(frame); cancelAnimationFrame(repairFrame)
    }
  }, [enabled])
  return enabled && editing ? <TvKeyboard key={editing.id || editing.name || editing.type} target={editing} onClose={() => setEditing(null)} /> : null
}
