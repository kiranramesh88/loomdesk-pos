import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { cx } from '@/lib/cx'

import { ToastContext, type ToastInput, type ToastTone } from './toastContext'

interface ToastItem extends Required<Pick<ToastInput, 'tone' | 'title'>> {
  id: number
  description?: string
}

const DURATION_MS = 5000
const MAX_VISIBLE = 3
const ICONS: Record<ToastTone, ReactNode> = { success: <CircleCheck />, error: <CircleAlert />, info: <Info /> }

/**
 * Short confirmations ("Product saved"). Never the only place an important error appears —
 * validation and failed saves stay next to the form (spec §4 "Feedback states").
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])
  const toast = useCallback((input: ToastInput) => {
    const item: ToastItem = { id: nextId.current++, tone: input.tone ?? 'success', title: input.title, description: input.description }
    setToasts((all) => [...all, item].slice(-MAX_VISIBLE))
  }, [])

  const api = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Two persistent live regions: errors are announced assertively, everything else politely. */}
      <div className="pointer-events-none fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-[22px] sm:bottom-[22px] sm:items-end">
        <div role="status" aria-live="polite" className="contents">
          {toasts.filter((t) => t.tone !== 'error').map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
        <div role="alert" aria-live="assertive" className="contents">
          {toasts.filter((t) => t.tone === 'error').map((t) => (
            <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(() => onDismiss(toast.id), DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [paused, toast.id, onDismiss])

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-[380px] animate-[rise-in_180ms_var(--ease-out)] items-start gap-2.5 rounded-control bg-navy-2 py-3 pr-2 pl-3.5 text-white shadow-overlay"
    >
      <span aria-hidden className={cx('mt-0.5 shrink-0 [&_svg]:size-4', toast.tone === 'error' ? 'text-danger-bg' : 'text-navy-indicator')}>
        {ICONS[toast.tone]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="type-body font-strong text-white">{toast.title}</p>
        {toast.description && <p className="mt-0.5 type-helper text-navy-text">{toast.description}</p>}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="grid size-7 shrink-0 place-items-center rounded-sm text-navy-text transition-control hover:bg-navy-3 hover:text-white [&_svg]:size-4"
      >
        <X />
      </button>
    </div>
  )
}
