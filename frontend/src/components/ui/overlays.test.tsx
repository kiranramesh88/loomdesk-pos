import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import { Dialog } from './Dialog'
import { IconButton } from './IconButton'
import { Menu } from './Menu'
import { ToastProvider } from './Toast'
import { useToast } from './toastContext'

describe('Dialog', () => {
  function Harness({ dismissible = true }: { dismissible?: boolean }) {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Button onClick={() => setOpen(true)}>Adjust stock</Button>
        <Dialog open={open} onOpenChange={setOpen} title="Adjust stock" description="Record why stock changed." dismissible={dismissible}>
          <input aria-label="Quantity" />
        </Dialog>
      </>
    )
  }

  it('moves focus inside, closes on Escape and returns focus to the trigger', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Adjust stock' })
    await userEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'Adjust stock' })
    expect(dialog).toHaveAccessibleDescription('Record why stock changed.')
    // Initial focus lands on the first field, not the header's close button.
    await waitFor(() => expect(screen.getByLabelText('Quantity')).toHaveFocus())

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('returns focus to the trigger even when timers lag', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Adjust stock' })
    await userEvent.click(trigger)
    await waitFor(() => expect(screen.getByLabelText('Quantity')).toHaveFocus())
    // Radix restores focus from a setTimeout; hold every timer and close.
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      act(() => {
        fireEvent.keyDown(screen.getByLabelText('Quantity'), { key: 'Escape' })
      })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps focus trapped inside while open', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Adjust stock' }))
    const dialog = await screen.findByRole('dialog')
    for (let i = 0; i < 4; i++) {
      await userEvent.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
  })

  it('cannot be dismissed with Escape while not dismissible', async () => {
    render(<Harness dismissible={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Adjust stock' }))
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  })
})

describe('ConfirmDialog', () => {
  function Harness({ onConfirm }: { onConfirm: (reason: string) => Promise<void> }) {
    const [open, setOpen] = useState(true)
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Void LD-00842?"
        description="Stock returns to inventory."
        confirmLabel="Void bill"
        tone="danger"
        reasonLabel="Reason for voiding"
        onConfirm={onConfirm}
      />
    )
  }

  it('requires a reason before confirming', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(<Harness onConfirm={onConfirm} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Void bill' }))
    expect(screen.getByLabelText('Reason for voiding')).toHaveAccessibleDescription('A reason is required.')
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('keeps the dialog open and shows the error when the action fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('You don’t have permission to void bills.'))
    render(<Harness onConfirm={onConfirm} />)
    await userEvent.type(await screen.findByLabelText('Reason for voiding'), 'Duplicate bill')
    await userEvent.click(screen.getByRole('button', { name: 'Void bill' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You don’t have permission to void bills.')
    expect(onConfirm).toHaveBeenCalledWith('Duplicate bill')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes after the action succeeds', async () => {
    render(<Harness onConfirm={() => Promise.resolve()} />)
    await userEvent.type(await screen.findByLabelText('Reason for voiding'), 'Customer changed mind')
    await userEvent.click(screen.getByRole('button', { name: 'Void bill' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

it('Menu opens from the keyboard and runs the chosen action', async () => {
  const onVoid = vi.fn()
  render(
    <Menu
      trigger={<IconButton label="Actions for LD-00842" icon={<svg />} />}
      items={[
        { label: 'View details', onSelect: () => {} },
        { label: 'Void bill', tone: 'danger', onSelect: onVoid },
      ]}
    />,
  )
  screen.getByRole('button', { name: 'Actions for LD-00842' }).focus()
  await userEvent.keyboard('{Enter}')
  const items = await screen.findAllByRole('menuitem')
  expect(items.map((i) => i.textContent)).toEqual(['View details', 'Void bill'])
  await userEvent.keyboard('{ArrowDown}{Enter}')
  await waitFor(() => expect(onVoid).toHaveBeenCalledOnce())
})

it('a dialog opened from a menu returns focus to the menu trigger when it closes', async () => {
  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <Menu
          trigger={<IconButton label="Row actions" icon={<svg />} />}
          items={[{ label: 'Void bill', tone: 'danger', onSelect: () => setOpen(true) }]}
        />
        <Dialog open={open} onOpenChange={setOpen} title="Void bill?">
          <p>Body</p>
        </Dialog>
      </>
    )
  }
  render(<Harness />)
  const trigger = screen.getByRole('button', { name: 'Row actions' })
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await screen.findByRole('menuitem', { name: 'Void bill' })
  await userEvent.keyboard('{Enter}')
  await screen.findByRole('dialog')
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
})

describe('Toast', () => {
  function Trigger() {
    const { toast } = useToast()
    return (
      <>
        <button onClick={() => toast({ title: 'Product saved' })}>success</button>
        <button onClick={() => toast({ tone: 'error', title: 'Couldn’t save' })}>error</button>
      </>
    )
  }

  afterEach(() => vi.useRealTimers())

  it('announces success politely and errors assertively', async () => {
    render(<ToastProvider><Trigger /></ToastProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'success' }))
    await userEvent.click(screen.getByRole('button', { name: 'error' }))
    expect(screen.getByRole('status')).toHaveTextContent('Product saved')
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save')
  })

  it('dismisses itself after five seconds, or with its close button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<ToastProvider><Trigger /></ToastProvider>)

    await user.click(screen.getByRole('button', { name: 'success' }))
    expect(screen.getByText('Product saved')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(5100))
    expect(screen.queryByText('Product saved')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'success' }))
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByText('Product saved')).not.toBeInTheDocument()
  })

  it('throws a clear error when used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger />)).toThrow('useToast must be used inside <ToastProvider>.')
  })
})
