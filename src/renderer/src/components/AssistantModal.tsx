import { useState } from 'react'
import type { Assistant } from '../global'
import { t } from '../lib/i18n'

interface Props {
  onClose: () => void
  onCreated: (a: Assistant) => void
}

const ICONS = ['✳', '◆', '🤖', '⚡', '🧠', '🦾', '✦', '◇']

export default function AssistantModal({ onClose, onCreated }: Props): JSX.Element {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('✳')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const a = await window.api.createAssistant({ name, icon, engineId: 'claude' })
      onCreated(a)
    } catch (e: any) {
      setError(e?.message || t('errNotCreated'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{t('newAssistantTitle')}</div>
        <div className="modal-sub">{t('newAssistantSub')}</div>

        <label className="modal-label">{t('fieldIcon')}</label>
        <div className="icon-row">
          {ICONS.map((ic) => (
            <button
              key={ic}
              className={`icon-pick ${icon === ic ? 'active' : ''}`}
              onClick={() => setIcon(ic)}
            >
              {ic}
            </button>
          ))}
        </div>

        <label className="modal-label">{t('fieldName')}</label>
        <input
          className="modal-input"
          autoFocus
          placeholder="onur-ai"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) create()
          }}
        />

        {error && <div className="modal-error">⚠ {error}</div>}
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            {t('cancel')}
          </button>
          <button className="btn primary" onClick={create} disabled={!name.trim() || busy}>
            {t('create')}
          </button>
        </div>
      </div>
    </div>
  )
}
