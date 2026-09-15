import { useState } from 'react'
import { t, ti } from '../lib/i18n'

interface Props {
  name: string
  onClose: () => void
  onCloseTab: () => void
  onDeleteConversation: () => Promise<void>
}

// Closing a tab and erasing the conversation behind it are different decisions,
// so the terminal's × asks which one the developer means.
export default function CloseTerminalModal({
  name,
  onClose,
  onCloseTab,
  onDeleteConversation
}: Props): JSX.Element {
  const [busy, setBusy] = useState(false)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{ti('closeTermTitle', { name })}</div>
        <div className="modal-sub">{t('closeTermSub')}</div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </button>
          <button className="btn primary" onClick={onCloseTab} disabled={busy}>
            {t('closeTermKeep')}
          </button>
          <button
            className="btn danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await onDeleteConversation()
              setBusy(false)
            }}
          >
            {busy ? '…' : t('closeTermDelete')}
          </button>
        </div>
      </div>
    </div>
  )
}
