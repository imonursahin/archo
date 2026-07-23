import { useMemo, useState } from 'react'
import { TEMPLATES, type Kind } from '../lib/templates'
import { t, ti } from '../lib/i18n'

interface Props {
  assistantId: string
  defaultKind?: Kind
  presetName?: string
  presetContent?: string
  onClose: () => void
  onCreated: (path: string) => void
}

export default function CreateModal({
  assistantId,
  defaultKind,
  presetName,
  presetContent,
  onClose,
  onCreated
}: Props): JSX.Element {
  // if content comes from a dropped file, infer the kind from its frontmatter
  const inferredKind: Kind =
    defaultKind ||
    (presetContent && /\btools\s*:/.test(presetContent)
      ? 'agent'
      : presetContent && /^#\s*\//.test(presetContent.replace(/^---[\s\S]*?---\n/, ''))
        ? 'command'
        : 'skill')
  const [kind, setKind] = useState<Kind>(inferredKind)
  const [name, setName] = useState(presetName || '')
  const [templateId, setTemplateId] = useState(presetContent ? 'dropped' : 'blank')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const templates = useMemo(() => {
    const base = TEMPLATES[kind]
    return presetContent
      ? [{ id: 'dropped', label: 'droppedFile', body: () => presetContent }, ...base]
      : base
  }, [kind, presetContent])
  const template = useMemo(
    () => templates.find((t) => t.id === templateId) || templates[0],
    [templates, templateId]
  )

  function pickKind(k: Kind): void {
    setKind(k)
    setTemplateId('blank')
  }

  async function create(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      const safe = name.trim().replace(/[^a-zA-Z0-9._-]/g, '-')
      const content = template.body(safe)
      const { path } = await window.api.createResource({ assistantId, kind, name, content })
      onCreated(path)
    } catch (e: any) {
      setError(e?.message || t('errNotCreated'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{t('newResource')}</div>
        <div className="modal-sub">{t('newResourceSub')}</div>
        <div className="kind-grid">
          {(['skill', 'agent', 'command'] as Kind[]).map((k) => (
            <button
              key={k}
              className={`kind-btn ${kind === k ? 'active' : ''}`}
              onClick={() => pickKind(k)}
            >
              {k === 'skill' ? 'Skill' : k === 'agent' ? 'Agent' : 'Command'}
            </button>
          ))}
        </div>

        <label className="modal-label">{t('fieldName')}</label>
        <input
          className="modal-input"
          autoFocus
          placeholder={ti('namePlaceholder', { kind })}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) create()
          }}
        />

        <label className="modal-label">{t('templateLabel')}</label>
        <div className="tpl-grid">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              className={`tpl-btn ${templateId === tpl.id ? 'active' : ''}`}
              onClick={() => setTemplateId(tpl.id)}
            >
              {t(tpl.label)}
            </button>
          ))}
        </div>
        <pre className="tpl-preview">{template.body(name.trim() || kind)}</pre>

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
