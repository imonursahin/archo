import { useEffect, useState } from 'react'
import { subscribeToasts, dismissToast, type Toast } from '../lib/toast'

const ICON: Record<Toast['kind'], string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warn: '⚠'
}

export default function ToastHost(): JSX.Element {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => subscribeToasts(setItems), [])

  return (
    <div className="toast-host">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismissToast(t.id)}>
          <span className="toast-ic">{ICON[t.kind]}</span>
          <span className="toast-msg">{t.message}</span>
        </div>
      ))}
    </div>
  )
}
