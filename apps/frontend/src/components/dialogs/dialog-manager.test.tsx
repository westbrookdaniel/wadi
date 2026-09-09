import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { DialogManagerProvider, useDialogManager } from './dialog-manager'

function SingleDialogHarness() {
  const { openDialog } = useDialogManager()
  const [result, setResult] = useState('')

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const next = await openDialog('watchlistCreate', { title: 'Create List' })
          setResult(JSON.stringify(next))
        }}
      >
        Open create
      </button>
      <p data-testid="result">{result}</p>
    </>
  )
}

function QueueHarness() {
  const { openDialog } = useDialogManager()
  const [result, setResult] = useState('')

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const first = openDialog('watchlistCreate', { title: 'First create' })
          const second = openDialog('watchlistCreate', { title: 'Second create' })
          const values = await Promise.all([first, second])
          setResult(JSON.stringify(values))
        }}
      >
        Open queued
      </button>
      <p data-testid="result">{result}</p>
    </>
  )
}

describe('DialogManagerProvider', () => {
  it('renders the requested dialog and resolves cancel payload', async () => {
    const user = userEvent.setup()

    render(
      <DialogManagerProvider>
        <SingleDialogHarness />
      </DialogManagerProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Open create' }))

    expect(screen.getByRole('heading', { name: 'Create List' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent('{"action":"cancel"}')
    })
  })

  it('queues dialogs FIFO and resolves each result in order', async () => {
    const user = userEvent.setup()

    render(
      <DialogManagerProvider>
        <QueueHarness />
      </DialogManagerProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Open queued' }))

    expect(screen.getByRole('heading', { name: 'First create' })).toBeInTheDocument()

    const firstInput = screen.getByRole('textbox')
    await user.type(firstInput, 'First list')
    await user.click(screen.getByRole('button', { name: 'Create list' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Second create' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Close' }))

    await waitFor(() => {
      expect(screen.getByTestId('result')).toHaveTextContent(
        '[{"action":"confirm","name":"First list"},{"action":"cancel"}]',
      )
    })
  })
})
