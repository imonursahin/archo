import { useState } from 'react'
import { t } from '../lib/i18n'

interface Props {
  onClose: () => void
  onClone: (url: string) => Promise<void>
}

// Electron's renderer has no window.prompt, so the URL is collected here.
export default function CloneModal({ onClose, onClone }: Props): JSX.Element {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(): Promise<void> {
    if (!url.trim() || busy) return
    setBusy(true)
    await onClone(url.trim())
    setBusy(false)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">⎇ {t('cloneAssistant')}</div>
        <div className="modal-sub">{t('clonePrompt')}</div>
        <input
          autoFocus
          className="modal-input"
          placeholder="git@github.com:someone/their-assistant.git"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') onClose()
          }}
        />
        <div className="modal-foot">
          <button className="btn" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button className="btn primary" onClick={submit} disabled={busy || !url.trim()}>
            {busy ? '…' : t('clone')}
          </button>
        </div>
      </div>
    </div>
  )
}
