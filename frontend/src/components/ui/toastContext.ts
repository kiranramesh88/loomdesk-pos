import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastInput {
  tone?: ToastTone
  title: string
  description?: string
}

export interface ToastApi {
  toast: (input: ToastInput) => void
}

export const ToastContext = createContext<ToastApi | null>(null)

/** Show a short confirmation toast. Must be used inside <ToastProvider>. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>.')
  return api
}
