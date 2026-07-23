import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../lib/i18n'

export interface Command {
  id: string
  label: string
  hint?: string
  group?: string
  run: () => void
}

interface Props {
  commands: Command[]
  onClose: () => void
}

export default function CommandPalette({ commands, onClose }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands.slice(0, 60)
    return commands
      .filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          (c.hint || '').toLowerCase().includes(q) ||
          (c.group || '').toLowerCase().includes(q)
      )
      .slice(0, 60)
  }, [commands, query])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.querySelector('.cmd-item.active')
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function onKey(e: React.KeyboardEvent): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const c = filtered[active]
      if (c) {
        onClose()
        c.run()
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="modal-backdrop cmd-backdrop" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <input
          className="cmd-input"
          autoFocus
          placeholder={t('cmdSearchPh')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="cmd-list" ref={listRef}>
          {filtered.length === 0 && <div className="cmd-empty">{t('cmdNoResult')}</div>}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              className={`cmd-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                onClose()
                c.run()
              }}
            >
              {c.group && <span className="cmd-group">{c.group}</span>}
              <span className="cmd-label">{c.label}</span>
              {c.hint && <span className="cmd-hint">{c.hint}</span>}
            </div>
          ))}
        </div>
        <div className="cmd-foot">{t('cmdFoot')}</div>
      </div>
    </div>
  )
}
