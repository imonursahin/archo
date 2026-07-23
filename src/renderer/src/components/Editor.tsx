import { useEffect, useMemo, useRef, useState } from 'react'
import type { ResourceItem } from '../global'
import { renderMarkdown } from '../lib/md'
import { toast } from '../lib/toast'
import { t, ti } from '../lib/i18n'

// textarea with a synced line-number gutter
function LineTextarea({
  value,
  onChange,
  className,
  placeholder
}: {
  value: string
  onChange: (v: string) => void
  className?: string
  placeholder?: string
}): JSX.Element {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const gutRef = useRef<HTMLDivElement>(null)
  const count = value.length ? value.split('\n').length : 1
  return (
    <div className={`lt-wrap ${className || ''}`}>
      <div className="lt-gutter" ref={gutRef}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={taRef}
        className="lt-area"
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onScroll={() => {
          if (gutRef.current && taRef.current)
            gutRef.current.scrollTop = taRef.current.scrollTop
        }}
      />
    </div>
  )
}

interface Props {
  item: ResourceItem | null
  onDirtyChange: (path: string | null) => void
  onClose?: () => void
}

type Mode = 'edit' | 'preview' | 'raw'

// known frontmatter keys suggested per resource kind (Claude Code conventions)
const FIELD_SUGGEST: Record<string, string[]> = {
  skill: ['allowed-tools', 'license', 'version'],
  agent: ['model', 'tools', 'color'],
  command: ['argument-hint', 'allowed-tools', 'model']
}
const MODEL_OPTS = ['inherit', 'opus', 'sonnet', 'haiku']
const COLOR_OPTS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'cyan']

function parse(text: string): { fm: Record<string, string>; order: string[]; body: string } {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { fm: {}, order: [], body: text }
  const fm: Record<string, string> = {}
  const order: string[] = []
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    if (!key) continue
    fm[key] = line.slice(idx + 1).trim()
    order.push(key)
  }
  return { fm, order, body: m[2] }
}

function serialize(fm: Record<string, string>, order: string[], body: string): string {
  if (order.length === 0) return body
  const lines = order.map((k) => `${k}: ${(fm[k] ?? '').replace(/\n+/g, ' ')}`)
  return `---\n${lines.join('\n')}\n---\n${body}`
}

export default function Editor({ item, onDirtyChange, onClose }: Props): JSX.Element {
  const [fm, setFm] = useState<Record<string, string>>({})
  const [order, setOrder] = useState<string[]>([])
  const [body, setBody] = useState('')
  const [original, setOriginal] = useState('')
  const [mode, setMode] = useState<Mode>('edit')
  const [rawText, setRawText] = useState('')
  const [saving, setSaving] = useState(false)
  const [addingField, setAddingField] = useState(false)
  const [customField, setCustomField] = useState('')

  // single source of truth for the current file text
  const current = mode === 'raw' ? rawText : serialize(fm, order, body)
  const dirty = current !== original

  useEffect(() => {
    if (!item?.path) {
      setFm({})
      setOrder([])
      setBody('')
      setOriginal('')
      setRawText('')
      return
    }
    const isJson = item.path.endsWith('.json')
    window.api.readResource(item.path).then((text) => {
      const p = parse(text)
      setFm(p.fm)
      setOrder(p.order)
      setBody(p.body)
      setRawText(text)
      setOriginal(text)
      setMode(isJson ? 'raw' : 'edit') // json (settings/plugins): raw only
    })
  }, [item?.path])

  useEffect(() => {
    onDirtyChange(dirty && item?.path ? item.path : null)
    return () => onDirtyChange(null) // clear the dirty dot when editor closes
  }, [dirty, item?.path, onDirtyChange])

  // switch modes while keeping both representations in sync
  function switchTo(next: Mode): void {
    if (next === mode) return
    if (mode === 'raw' && next !== 'raw') {
      // coming FROM raw: parse edits back into fields
      const p = parse(rawText)
      setFm(p.fm)
      setOrder(p.order)
      setBody(p.body)
    }
    if (next === 'raw') {
      // going TO raw: serialize current fields into text
      setRawText(serialize(fm, order, body))
    }
    setMode(next)
  }

  async function save(): Promise<void> {
    if (!item?.path || !dirty) return
    setSaving(true)
    const text = current
    await window.api.writeResource(item.path, text)
    const p = parse(text)
    setFm(p.fm)
    setOrder(p.order)
    setBody(p.body)
    setRawText(text)
    setOriginal(text)
    setSaving(false)
    toast(ti('toastSaved', { name: item.name }), 'success')
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function setField(key: string, value: string): void {
    setFm((f) => ({ ...f, [key]: value }))
    setOrder((o) => (o.includes(key) ? o : [...o, key]))
  }
  function removeField(key: string): void {
    setFm((f) => {
      const n = { ...f }
      delete n[key]
      return n
    })
    setOrder((o) => o.filter((k) => k !== key))
  }

  const fileName = useMemo(
    () => (item?.path ? item.path.split('/').pop() : item?.name),
    [item]
  )

  const previewHtml = useMemo(() => {
    const parsed = parse(current)
    return renderMarkdown(parsed.body)
  }, [current])

  if (!item) {
    return (
      <div className="empty">
        <div className="big">{t('pickResource')}</div>
        <div>{t('pickResourceSub')}</div>
      </div>
    )
  }

  const hasFm = order.length > 0
  const extraKeys = order.filter((k) => !['name', 'description'].includes(k))
  const isJson = !!item.path && item.path.endsWith('.json')
  const suggestions = (FIELD_SUGGEST[item.kind] || []).filter((k) => !order.includes(k))

  // pick a control based on the field key / value shape
  function renderControl(key: string): JSX.Element {
    const val = fm[key] ?? ''
    if (key === 'model') {
      const opts = MODEL_OPTS.includes(val) || !val ? MODEL_OPTS : [val, ...MODEL_OPTS]
      return (
        <select value={val} onChange={(e) => setField(key, e.target.value)}>
          <option value="">{t('selectOpt')}</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    }
    if (key === 'color') {
      const opts = COLOR_OPTS.includes(val) || !val ? COLOR_OPTS : [val, ...COLOR_OPTS]
      return (
        <select value={val} onChange={(e) => setField(key, e.target.value)}>
          <option value="">{t('selectOpt')}</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    }
    if (val === 'true' || val === 'false') {
      return (
        <button
          type="button"
          className={`switch ${val === 'true' ? 'on' : ''}`}
          onClick={() => setField(key, val === 'true' ? 'false' : 'true')}
        >
          <span className="knob" />
        </button>
      )
    }
    if (val.length > 60) {
      return (
        <textarea
          className="doc-meta-area"
          value={val}
          onChange={(e) => setField(key, e.target.value)}
        />
      )
    }
    return <input value={val} onChange={(e) => setField(key, e.target.value)} />
  }

  function addField(key: string): void {
    const k = key.trim()
    if (!k) return
    setField(k, '')
    setAddingField(false)
    setCustomField('')
  }

  return (
    <>
      <div className="editor-head">
        {onClose && (
          <button className="editor-close" onClick={onClose} title={t('close')}>
            ×
          </button>
        )}
        <span className="fname">{fileName}</span>
        {dirty && <span className="dirty-dot" />}
        <div className="modes">
          {isJson
            ? null
            : // no frontmatter (e.g. CLAUDE.md) → "Düzenle" already shows the raw
              // content, so the "Ham metin" tab is redundant
              ((hasFm ? ['edit', 'preview', 'raw'] : ['edit', 'preview']) as Mode[]).map((m) => (
                <button
                  key={m}
                  className={mode === m ? 'active' : ''}
                  onClick={() => switchTo(m)}
                >
                  {m === 'edit' ? t('modeEdit') : m === 'preview' ? t('modePreview') : t('modeRaw')}
                </button>
              ))}
        </div>
      </div>

      {mode === 'raw' && (
        <div className="editor-body">
          <LineTextarea className="raw-lt" value={rawText} onChange={setRawText} />
        </div>
      )}

      {mode === 'preview' && (
        <div className="editor-body">
          <div className="md-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
      )}

      {mode === 'edit' && (
        <div className="editor-body doc">
          {hasFm && (
            <>
              <div className="doc-field-label">{t('fieldTitle')}</div>
              <input
                className="doc-title"
                placeholder={t('fieldTitleName')}
                value={fm.name ?? ''}
                onChange={(e) => setField('name', e.target.value)}
              />
              <div className="doc-field-label" style={{ marginTop: 14 }}>
                {t('fieldDetail')}
              </div>
              <input
                className="doc-desc"
                placeholder={t('descPlaceholder')}
                value={fm.description ?? ''}
                onChange={(e) => setField('description', e.target.value.replace(/\n/g, ' '))}
              />
              <div className="doc-meta">
                {extraKeys.map((k) => (
                  <div className="doc-meta-row" key={k}>
                    <label>{k}</label>
                    {renderControl(k)}
                    <button
                      className="doc-field-del"
                      title={t('removeField')}
                      onClick={() => removeField(k)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {addingField ? (
                  <div className="doc-addfield-menu">
                    {suggestions.map((s) => (
                      <button key={s} className="doc-suggest" onClick={() => addField(s)}>
                        + {s}
                      </button>
                    ))}
                    <input
                      className="doc-custom-field"
                      autoFocus
                      placeholder={t('customFieldPh')}
                      value={customField}
                      onChange={(e) => setCustomField(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') addField(customField)
                        if (e.key === 'Escape') setAddingField(false)
                      }}
                    />
                    <button className="doc-addfield-x" onClick={() => setAddingField(false)}>
                      ×
                    </button>
                  </div>
                ) : (
                  <button className="doc-addfield-btn" onClick={() => setAddingField(true)}>
                    {t('addField')}
                  </button>
                )}
              </div>
            </>
          )}
          <div className="doc-field-label" style={{ marginTop: hasFm ? 16 : 0 }}>
            {t('content')}
          </div>
          <LineTextarea
            className="doc-body-lt"
            placeholder={hasFm ? t('contentPlaceholder') : t('fileContentPlaceholder')}
            value={body}
            onChange={setBody}
          />
        </div>
      )}

      <div className="editor-foot">
        <button className="btn primary" onClick={save} disabled={!dirty || saving}>
          {t('saveIcon')}
        </button>
        <button
          className="btn"
          onClick={() => {
            const p = parse(original)
            setFm(p.fm)
            setOrder(p.order)
            setBody(p.body)
            setRawText(original)
          }}
          disabled={!dirty}
        >
          {t('undo')}
        </button>
        <div className="foot-status">
          {dirty ? (
            <>
              <span className="dirty-dot" /> {t('unsavedChanges')}
            </>
          ) : (
            <>{t('savedCheck')}</>
          )}
        </div>
      </div>
    </>
  )
}
