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

  it('sorts by a column on request, keeps empty values last and leaves unsortable headers alone', async () => {
    const columns: Column<Row & { cost: number | null }>[] = [
      { id: 'name', header: 'Product', cell: (r) => r.name, sortValue: (r) => r.name },
      { id: 'cost', header: 'Cost', align: 'right', cell: (r) => (r.cost === null ? '—' : String(r.cost)), sortValue: (r) => r.cost },
      { id: 'note', header: 'Note', cell: () => '' },
    ]
    const rows = [
      { id: '1', name: 'shirt 10', totalPaise: 0, cost: 500 },
      { id: '2', name: 'Shirt 9', totalPaise: 0, cost: null },
      { id: '3', name: 'apron', totalPaise: 0, cost: 120 },
    ]
    render(<DataTable caption="Costs" columns={columns} rows={rows} getRowId={(r) => r.id} empty={null} />)
    const names = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0]?.textContent)
    expect(names()).toEqual(['shirt 10', 'Shirt 9', 'apron'])
    expect(screen.getByRole('columnheader', { name: 'Note' })).not.toHaveAttribute('aria-sort')
    await userEvent.click(screen.getByRole('button', { name: 'Product' }))
    // Case-insensitive, with numbers in names compared as numbers.
    expect(names()).toEqual(['apron', 'Shirt 9', 'shirt 10'])
    const cost = screen.getByRole('columnheader', { name: 'Cost' })
    await userEvent.click(within(cost).getByRole('button'))
    expect(names()).toEqual(['apron', 'shirt 10', 'Shirt 9'])
    await userEvent.click(within(cost).getByRole('button'))
    expect(cost).toHaveAttribute('aria-sort', 'descending')
    expect(names()).toEqual(['shirt 10', 'apron', 'Shirt 9'])
    expect(screen.getByRole('columnheader', { name: 'Product' })).toHaveAttribute('aria-sort', 'none')
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
