// Tiny toast bus. Components subscribe; anywhere can push a toast.
import { getPrefs } from './prefs'

export type ToastKind = 'success' | 'error' | 'info' | 'warn'
export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

type Listener = (toasts: Toast[]) => void

let toasts: Toast[] = []
let seq = 1
const listeners = new Set<Listener>()

function emit(): void {
  listeners.forEach((l) => l(toasts))
}

export function subscribeToasts(l: Listener): () => void {
  listeners.add(l)
  l(toasts)
  return () => listeners.delete(l)
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function toast(message: string, kind: ToastKind = 'info', ttl = 3200): void {
  // errors always show; other kinds respect the notifications pref
  if (kind !== 'error' && !getPrefs().notifications) return
  const id = seq++
  toasts = [...toasts, { id, kind, message }]
  emit()
  setTimeout(() => dismissToast(id), ttl)
}
