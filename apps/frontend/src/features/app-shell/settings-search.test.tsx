import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { SettingsSearch } from './settings-search'
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
const sections = [['playback', 'Playback'], ['experimental', 'Experimental']]
function Fixture() {
  const [section, setSection] = useState('playback')
  return <><SettingsSearch sections={sections} onNavigate={setSection} />
    <section id="playback" hidden={section !== 'playback'}><label>Appearance<select><option>Dark</option></select></label></section>
    <section id="experimental" hidden={section !== 'experimental'}><details><summary>Experimental settings</summary><label>TV mode<input type="checkbox" /></label></details></section>
  </>
}
it('finds and focuses a setting in a hidden section and opens its collapsed group', () => {
  vi.useFakeTimers()
  const scroll = vi.fn()
  HTMLElement.prototype.scrollIntoView = scroll
  render(<Fixture />)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'tv mode' } })
  fireEvent.click(screen.getByRole('button', { name: 'TV mode — Experimental' }))
  act(() => vi.advanceTimersByTime(20))
  const checkbox = screen.getByRole('checkbox', { name: 'TV mode' })
  expect(checkbox).toHaveFocus()
  expect(checkbox.closest('details')).toHaveAttribute('open')
  expect(checkbox.closest('section')).not.toHaveAttribute('hidden')
  expect(scroll).toHaveBeenCalled()
  expect(screen.getByRole('searchbox')).toHaveValue('')
})
it('supports Enter, no matches, whitespace and clearing with Escape', () => {
  vi.useFakeTimers()
  HTMLElement.prototype.scrollIntoView = vi.fn()
  render(<Fixture />)
  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: '   APPEARANCE  ' } })
  fireEvent.keyDown(search, { key: 'Enter' })
  act(() => vi.advanceTimersByTime(20))
  expect(screen.getByRole('combobox')).toHaveFocus()
  fireEvent.change(search, { target: { value: 'unknown setting' } })
  expect(screen.getByRole('status')).toHaveTextContent('No matching settings')
  fireEvent.keyDown(search, { key: 'Escape' })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('finds account descriptions and navigates to their section', () => {
  const navigate = vi.fn()
  render(<><SettingsSearch sections={[["account", "Account"]]} onNavigate={navigate} /><section id="account"><button>Account details Manage email and password.</button></section></>)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'password' } })
  fireEvent.click(screen.getByRole('button', { name: /Account details.*— Account/ }))
  expect(navigate).toHaveBeenCalledWith('account')
})
