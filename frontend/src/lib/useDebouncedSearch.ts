import { useEffect, useRef, useState } from 'react'

const SEARCH_DELAY_MS = 300

/**
 * A search box mirrored to the URL. Typing stays local, and `onCommit` runs once typing pauses.
 * When the URL value changes from elsewhere (clear filters, back button), the box follows and any
 * pending commit is dropped, so an old query can never be written back.
 */
export function useDebouncedSearch(urlValue: string, onCommit: (value: string) => void) {
  const [value, setValue] = useState(urlValue)
  const [synced, setSynced] = useState(urlValue)
  const pending = useRef<number | undefined>(undefined)
  const committed = useRef(urlValue)
  if (urlValue !== synced) {
    setSynced(urlValue)
    setValue(urlValue)
  }
  useEffect(() => {
    if (urlValue !== committed.current) window.clearTimeout(pending.current)
    committed.current = urlValue
  }, [urlValue])
  useEffect(() => () => window.clearTimeout(pending.current), [])

  const type = (next: string) => {
    setValue(next)
    window.clearTimeout(pending.current)
    pending.current = window.setTimeout(() => {
      committed.current = next.trim()
      onCommit(next.trim())
    }, SEARCH_DELAY_MS)
  }
  /** Drop any pending commit, e.g. before clearing every filter. */
  const cancel = () => {
    window.clearTimeout(pending.current)
    setValue('')
  }
  return { value, type, cancel }
}
