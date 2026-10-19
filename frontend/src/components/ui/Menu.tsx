import * as RadixMenu from '@radix-ui/react-dropdown-menu'
import type { ReactElement, ReactNode } from 'react'

import { cx } from '@/lib/cx'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  /** Destructive actions are separated from the rest and shown in the danger colour. */
  tone?: 'default' | 'danger'
  disabled?: boolean
}

export interface MenuProps {
  /** A focusable trigger, usually an IconButton with a "More actions" label. */
  trigger: ReactElement
  items: readonly MenuItem[]
  align?: 'start' | 'end'
}

/** Overflow / row-actions menu (Radix: arrow-key navigation, typeahead, focus return). */
export function Menu({ trigger, items, align = 'end' }: MenuProps) {
  const regular = items.filter((item) => item.tone !== 'danger')
  const destructive = items.filter((item) => item.tone === 'danger')

  return (
    <RadixMenu.Root>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          align={align}
          sideOffset={6}
          className="z-50 min-w-[180px] rounded-control border border-line bg-surface p-1 shadow-overlay"
        >
          {regular.map((item) => (
            <MenuRow key={item.label} item={item} />
          ))}
          {regular.length > 0 && destructive.length > 0 && <RadixMenu.Separator className="my-1 h-px bg-line" />}
          {destructive.map((item) => (
            <MenuRow key={item.label} item={item} />
          ))}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  )
}

function MenuRow({ item }: { item: MenuItem }) {
  return (
    <RadixMenu.Item
      disabled={item.disabled}
      // Run the action after the menu has closed and returned focus to its trigger, so a
      // dialog opened from here restores focus to the trigger instead of a removed item.
      onSelect={() => window.setTimeout(item.onSelect, 0)}
      className={cx(
        'flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 type-body outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:text-ink-disabled data-[highlighted]:bg-surface-muted [&_svg]:size-4 [&_svg]:shrink-0',
        item.tone === 'danger' ? 'text-danger' : 'text-ink-2 [&_svg]:text-muted',
      )}
    >
      {item.icon}
      {item.label}
    </RadixMenu.Item>
  )
}
