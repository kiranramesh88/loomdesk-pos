import { Search, X } from 'lucide-react'
import { forwardRef, useImperativeHandle, useRef, type InputHTMLAttributes } from 'react'

import { cx } from '@/lib/cx'

import { CONTROL_TEXT, controlBox } from './controlStyles'
import { IconButton } from './IconButton'

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange' | 'value' | 'type'> {
  /** Accessible name; the visible cue is the placeholder plus search icon. */
  label: string
  value: string
  onValueChange: (value: string) => void
  size?: 'md' | 'lg'
  /** Optional visible keyboard hint, e.g. "/". The shortcut itself is bound by the page. */
  shortcutHint?: string
}

/** Search field placed next to the content it filters (spec §4). Escape or the × clears it. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { label, value, onValueChange, size = 'md', shortcutHint, className, onKeyDown, ...rest },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => inputRef.current!, [])

  const clear = () => {
    onValueChange('')
    inputRef.current?.focus()
  }

  return (
    <div className={cx(controlBox(), size === 'lg' && 'h-control-lg', 'focus-ring-within min-w-0', className)}>
      <Search aria-hidden className="ml-3 size-4 shrink-0 text-muted" />
      <input
        ref={inputRef}
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && value) {
            event.preventDefault()
            clear()
          }
          onKeyDown?.(event)
        }}
        className={cx(
          'h-full min-w-0 flex-1 bg-transparent pr-2 pl-2.5 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden',
          CONTROL_TEXT,
        )}
        {...rest}
      />
      {value ? (
        <IconButton label="Clear search" icon={<X />} onClick={clear} className="mr-1" />
      ) : (
        shortcutHint && (
          <kbd className="mr-2.5 rounded-sm border border-line-strong bg-surface-muted px-1.5 type-caption font-strong text-muted">
            {shortcutHint}
          </kbd>
        )
      )}
    </div>
  )
})
