import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IndianRupee } from 'lucide-react'

import { EmptyState } from '@/components/feedback/EmptyState'

import { DataTable, type Column } from './DataTable'
import { KpiCard } from './KpiCard'
import { MoneyValue } from './MoneyValue'
import { PageHeader } from './PageHeader'
import { StatusBadge } from './StatusBadge'

interface Row {
  id: string
  name: string
  totalPaise: number
}

const COLUMNS: Column<Row>[] = [
  { id: 'name', header: 'Product', cell: (r) => r.name },
  { id: 'total', header: 'Total', align: 'right', cell: (r) => <MoneyValue paise={r.totalPaise} /> },
  { id: 'actions', header: 'Actions', hideHeader: true, cell: () => <button>Edit</button> },
]

describe('DataTable', () => {
  const base = {
    caption: 'Products',
    columns: COLUMNS,
    getRowId: (r: Row) => r.id,
    empty: <EmptyState icon={<svg />} title="No products yet" />,
  }

  it('renders rows with right-aligned amounts and a screen-reader caption', () => {
    render(<DataTable {...base} rows={[{ id: '1', name: 'Classic Cotton Shirt', totalPaise: 119_900 }]} />)
    const table = screen.getByRole('table', { name: 'Products' })
    const amount = within(table).getByText('₹1,199.00')
    expect(amount.closest('td')).toHaveClass('text-right')
    expect(within(table).getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument()
  })

  it('shows skeleton rows and marks itself busy while loading', () => {
    render(<DataTable {...base} rows={undefined} isLoading skeletonRows={3} />)
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByRole('row')).toHaveLength(1 + 3)
  })

  it('shows the empty state', () => {
    render(<DataTable {...base} rows={[]} />)
    expect(screen.getByText('No products yet')).toBeInTheDocument()
  })

  it('shows the error with a retry inside the table', async () => {
    const onRetry = vi.fn()
    render(<DataTable {...base} rows={undefined} error={new Error('Can’t reach the server.')} onRetry={onRetry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Can’t reach the server.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe('KpiCard', () => {
  it('shows value, trend and footnote', () => {
    render(
      <KpiCard label="Net sales today" value="₹48,620" icon={IndianRupee} footnote="vs last Monday" trend={{ direction: 'up', label: '12.8%' }} />,
    )
    expect(screen.getByText('₹48,620')).toBeInTheDocument()
    expect(screen.getByText('12.8%')).toHaveClass('text-success')
    expect(screen.getByText('vs last Monday')).toBeInTheDocument()
  })

  it('colours an unfavourable rise as a warning sign', () => {
    render(<KpiCard label="Returns" value="₹4,280" icon={IndianRupee} trend={{ direction: 'up', label: '3 more', favourable: false }} />)
    expect(screen.getByText('3 more')).toHaveClass('text-danger')
  })

  it('announces loading instead of a value', () => {
    render(<KpiCard label="Low-stock variants" value="7" icon={IndianRupee} isLoading />)
    expect(screen.getByRole('status', { name: 'Loading Low-stock variants' })).toBeInTheDocument()
    expect(screen.queryByText('7')).not.toBeInTheDocument()
  })
})

it('StatusBadge always carries a text label', () => {
  render(<StatusBadge tone="warning">Low stock</StatusBadge>)
  expect(screen.getByText('Low stock')).toHaveClass('text-warning')
})

it('PageHeader renders the single page heading', () => {
  render(<PageHeader title="Inventory" description="What stock do we have?" actions={<button>Adjust stock</button>} />)
  expect(screen.getByRole('heading', { level: 1, name: 'Inventory' })).toBeInTheDocument()
})
