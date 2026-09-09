import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { TvNavigation } from './tv-navigation'
import { nearestTarget } from './tv-spatial'
import { useDeviceStore } from '@/store/device-store'

function rect(element: HTMLElement, x: number, y: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(x, y, 100, 40))
  vi.spyOn(element, 'getClientRects').mockReturnValue({ length: 1, item: () => new DOMRect(x, y, 100, 40), [Symbol.iterator]: () => [new DOMRect(x, y, 100, 40)][Symbol.iterator](), 0: new DOMRect(x, y, 100, 40) })
  element.scrollIntoView = vi.fn()
}
beforeEach(() => { useDeviceStore.setState({ tvMode: true, conversion: false }) })
afterEach(() => { cleanup(); useDeviceStore.setState({ tvMode: false }); vi.restoreAllMocks() })
it('prefers adjacent cards in the same row and does not wrap at the edge', () => {
  const right = document.createElement('button'), below = document.createElement('button')
  rect(right, 120, 0); rect(below, 10, 100)
  expect(nearestTarget(new DOMRect(0, 0, 100, 40), [below, right], 'ArrowRight')).toBe(right)
  expect(nearestTarget(new DOMRect(0, 0, 100, 40), [below, right], 'ArrowLeft')).toBeUndefined()
})
it('moves focus, leaves editing fields vertically and keeps modal focus inside', () => {
  const view = render(<><TvNavigation /><button>First</button><input aria-label="Search" /><button>Last</button></>)
  const first = view.getByText('First'), search = view.getByLabelText('Search'), last = view.getByText('Last')
  rect(first, 0, 0); rect(search, 0, 70); rect(last, 0, 140)
  first.focus(); fireEvent.keyDown(first, { key: 'ArrowDown' }); expect(document.activeElement).toBe(search)
  fireEvent.keyDown(search, { key: 'ArrowLeft' }); expect(document.activeElement).toBe(search)
  fireEvent.keyDown(search, { key: 'ArrowDown' }); expect(document.activeElement).toBe(last)
  view.rerender(<><TvNavigation /><button>Outside</button><div role="dialog"><button>Inside</button><button>Next</button></div></>)
  const inside = view.getByText('Inside'), next = view.getByText('Next'), outside = view.getByText('Outside')
  rect(view.getByRole('dialog'), 80, 0); rect(inside, 100, 0); rect(next, 100, 70); rect(outside, 0, 0)
  inside.focus(); fireEvent.keyDown(inside, { key: 'ArrowLeft' }); expect(document.activeElement).toBe(inside)
  fireEvent.keyDown(inside, { key: 'ArrowDown' }); expect(document.activeElement).toBe(next)
})
it('does not intercept arrows when TV mode is off', () => {
  useDeviceStore.setState({ tvMode: false })
  const view = render(<><TvNavigation /><button>First</button><button>Next</button></>)
  const first = view.getByText('First'), next = view.getByText('Next')
  rect(first, 0, 0); rect(next, 120, 0); first.focus()
  fireEvent.keyDown(first, { key: 'ArrowRight' }); expect(document.activeElement).toBe(first)
})
