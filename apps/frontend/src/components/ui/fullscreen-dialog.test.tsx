import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

afterEach(() => {
  cleanup()
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null })
  document.getElementById('test-fullscreen-player')?.remove()
})

it.each([false, true])('opens settings and its dropdown inside the visible layer, fullscreen=%s', async fullscreen => {
  const user = userEvent.setup()
  const player = document.createElement('div')
  player.id = 'test-fullscreen-player'
  document.body.append(player)
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: fullscreen ? player : null })
  render(<Dialog><DialogTrigger>Subtitle settings</DialogTrigger><DialogContent aria-describedby={undefined}>
    <DialogTitle>Subtitle settings</DialogTitle>
    <Select defaultValue="outline"><SelectTrigger aria-label="Text border"><SelectValue /></SelectTrigger><SelectContent>
      <SelectItem value="outline">Outline</SelectItem><SelectItem value="shadow">Shadow</SelectItem>
    </SelectContent></Select>
  </DialogContent></Dialog>)
  await user.click(screen.getByRole('button', { name: 'Subtitle settings' }))
  const dialog = screen.getByRole('dialog', { name: 'Subtitle settings' })
  expect(dialog).toBeVisible()
  expect(player.contains(dialog)).toBe(fullscreen)
  await user.click(screen.getByRole('combobox', { name: 'Text border' }))
  expect(player.contains(screen.getByRole('listbox'))).toBe(fullscreen)
  await user.click(screen.getByRole('option', { name: 'Shadow' }))
  expect(screen.getByRole('combobox', { name: 'Text border' })).toHaveTextContent('Shadow')
  await user.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
