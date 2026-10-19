import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { Button } from './Button'
import { IconButton } from './IconButton'
import { SearchInput } from './SearchInput'
import { Select } from './Select'
import { Textarea } from './Textarea'
import { TextField } from './TextField'

describe('Button', () => {
  it('is disabled and announces busy while loading', async () => {
    const onClick = vi.fn()
    render(<Button loading loadingLabel="Saving…" onClick={onClick}>Save</Button>)
    const button = screen.getByRole('button', { name: 'Saving…' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Cancel</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })
})

it('IconButton exposes its label as the accessible name', () => {
  render(<IconButton label="Edit product" icon={<svg />} />)
  expect(screen.getByRole('button', { name: 'Edit product' })).toBeInTheDocument()
})

describe('TextField', () => {
  it('links the label, and describes the field with its error', () => {
    render(<TextField label="SKU" error="This SKU is already used." hint="ignored when there is an error" />)
    const input = screen.getByLabelText('SKU')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('This SKU is already used.')
    expect(screen.queryByText('ignored when there is an error')).not.toBeInTheDocument()
  })

  it('describes the field with its hint and marks optional fields', () => {
    render(<TextField label="Barcode" optional hint="Scan or type the EAN-13." />)
    const input = screen.getByLabelText('Barcode (optional)')
    expect(input).not.toHaveAttribute('aria-invalid')
    expect(input).toHaveAccessibleDescription('Scan or type the EAN-13.')
  })

  it('keeps a hidden label available to screen readers', () => {
    render(<TextField label="Quantity" hideLabel />)
    expect(screen.getByLabelText('Quantity')).toBeInTheDocument()
  })
})

it('Textarea wires label and error like TextField', () => {
  render(<Textarea label="Reason" error="A reason is required." />)
  expect(screen.getByLabelText('Reason')).toHaveAccessibleDescription('A reason is required.')
})

describe('SearchInput', () => {
  function Harness() {
    const [value, setValue] = useState('')
    return <SearchInput label="Search products" value={value} onValueChange={setValue} shortcutHint="/" />
  }

  it('clears with the button and returns focus to the field', async () => {
    render(<Harness />)
    const input = screen.getByRole('searchbox', { name: 'Search products' })
    expect(screen.getByText('/')).toBeInTheDocument()
    await userEvent.type(input, 'kurta')
    expect(input).toHaveValue('kurta')
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('clears with Escape', async () => {
    render(<Harness />)
    const input = screen.getByRole('searchbox')
    await userEvent.type(input, 'denim{Escape}')
    expect(input).toHaveValue('')
  })
})

describe('Select', () => {
  const OPTIONS = [
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' },
    { value: 'card', label: 'Card', disabled: true },
  ]

  function Harness({ onChange }: { onChange: (v: string) => void }) {
    const [value, setValue] = useState<string>()
    return (
      <Select
        label="Payment method"
        options={OPTIONS}
        value={value}
        placeholder="Choose a method"
        onValueChange={(v) => {
          setValue(v)
          onChange(v)
        }}
      />
    )
  }

  it('can be operated with the keyboard', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const trigger = screen.getByRole('combobox', { name: 'Payment method' })
    expect(trigger).toHaveTextContent('Choose a method')

    trigger.focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('option', { name: 'Card' })).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(onChange).toHaveBeenCalledWith('upi')
    expect(trigger).toHaveTextContent('UPI')
    expect(trigger).toHaveFocus()
  })

  it('shows its error and marks the trigger invalid', () => {
    render(<Select label="Category" options={OPTIONS} value={undefined} onValueChange={() => {}} error="Choose a category." />)
    const trigger = screen.getByRole('combobox', { name: 'Category' })
    expect(trigger).toHaveAttribute('aria-invalid', 'true')
    expect(trigger).toHaveAccessibleDescription('Choose a category.')
  })
})

// tests/contrast.test.ts proves `control-border` reaches 3:1; this proves every field uses it.
describe('field boundaries', () => {
  it('use the 3:1 control-border token on text fields, textareas, search and select', () => {
    render(
      <>
        <TextField label="Product name" />
        <Textarea label="Notes" />
        <SearchInput label="Search products" value="" onValueChange={() => {}} />
        <Select label="Category" options={[{ value: 'a', label: 'A' }]} value={undefined} onValueChange={() => {}} />
      </>,
    )
    const boxes = [
      screen.getByLabelText('Product name').parentElement!,
      screen.getByLabelText('Notes'),
      screen.getByLabelText('Search products').parentElement!,
      screen.getByRole('combobox', { name: 'Category' }),
    ]
    for (const box of boxes) expect(box).toHaveClass('border-control-border')
  })

  it('switch to the danger boundary when invalid', () => {
    render(<TextField label="SKU" error="Already used." />)
    expect(screen.getByLabelText('SKU').parentElement).toHaveClass('border-danger')
  })
})
