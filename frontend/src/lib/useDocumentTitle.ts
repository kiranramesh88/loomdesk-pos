import { useEffect } from 'react'

/** Sets the browser tab title to "<title> · LoomDesk". */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · LoomDesk`
  }, [title])
}
