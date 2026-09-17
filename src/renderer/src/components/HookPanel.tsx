import { useState } from 'react'
import type { ResourceItem } from '../global'
import { toast } from '../lib/toast'
import { t, ti } from '../lib/i18n'

interface Props {
  item: ResourceItem
  onClose: () => void
  onChanged?: () => void
}

interface HookCmd {
  type?: string
  command?: string
  timeout?: number
}
interface Matcher {
  matcher?: string
  hooks?: HookCmd[]
}

// Events Claude Code fires. A settings.json may name one we don't know yet, so
// this drives suggestions only — never validation.
const KNOWN_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Notification',
  'Stop',
  'SubagentStop',
  'PreCompact',
  'SessionStart',
  'SessionEnd'
]

function asMatchers(meta: unknown): Matcher[] {
  return Array.isArray(meta) ? (meta as Matcher[]) : []
}

export default function HookPanel({ item, onClose, onChanged }: Props): JSX.Element {
  const [matchers, setMatchers] = useState<Matcher[]>(asMatchers(item.meta))
  const [raw, setRaw] = useState(true)
  const [draft, setDraft] = useState(() => JSON.stringify(asMatchers(item.meta), null, 2))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const event = item.name
  const file = item.path || ''
  const fileName = file.split(/[/\\]/).pop() || ''
  const isLocal = fileName.includes('.local.')

  async function persist(next: Matcher[]): Promise<boolean> {
    setBusy(true)
    setErr('')
    try {
      await window.api.updateHookEvent(file, event, next)
    } catch (e) {
      // a read-only settings file or a full disk must not look like a save
      setErr((e as Error)?.message || String(e))
      return false
    } finally {
      setBusy(false)
    }
    setMatchers(next)
    onChanged?.()
    toast(ti('toastSaved', { name: event }), 'success')
    return true
  }

  function patch(i: number, p: Partial<Matcher>): void {
    setMatchers((m) => m.map((x, idx) => (idx === i ? { ...x, ...p } : x)))
  }
  function patchCmd(i: number, j: number, p: Partial<HookCmd>): void {
    setMatchers((m) =>
      m.map((x, idx) =>
        idx === i
          ? { ...x, hooks: (x.hooks || []).map((h, hj) => (hj === j ? { ...h, ...p } : h)) }
          : x
      )
    )
  }

  async function saveRaw(): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(draft)
    } catch (e) {
      setErr(t('errInvalidJson') + ((e as Error)?.message || ''))
      return
    }
    if (!Array.isArray(parsed)) {
      setErr(t('hookMustBeArray'))
      return
    }
    setErr('')
    await persist(parsed as Matcher[])
  }

  async function removeEvent(): Promise<void> {
    if (!confirm(ti('confirmDeleteHook', { name: event }))) return
    try {
      await window.api.deleteHookEvent(file, event)
    } catch (e) {
      setErr((e as Error)?.message || String(e))
      return
    }
    onChanged?.()
    onClose()
  }

  return (
    <>
      <div className="editor-head">
        <button className="editor-close" onClick={onClose} title={t('close')}>
          ×
        </button>
        <span className="fname">{event}</span>
        <span className="muted hook-file">{fileName}</span>
        <div className="modes">
          <button className={!raw ? 'active' : ''} onClick={() => setRaw(false)}>
            {t('modeEdit')}
          </button>
          <button
            className={raw ? 'active' : ''}
            onClick={() => {
              if (raw) return
              setDraft(JSON.stringify(matchers, null, 2))
              setErr('')
              setRaw(true)
            }}
          >
            {t('modeRaw')}
          </button>
        </div>
      </div>

      <div className="editor-body doc">
        {isLocal && <div className="hook-note">{t('hookLocalNote')}</div>}
        {!KNOWN_EVENTS.includes(event) && (
          <div className="hook-note">{ti('hookUnknownEvent', { name: event })}</div>
        )}
        {!raw && err && <div className="modal-error">{err}</div>}

        {raw ? (
          <>
            <textarea
              className="raw-area mcp-edit-area"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            {err && <div className="modal-error">{err}</div>}
            <div className="hook-foot">
              <button className="btn primary" onClick={saveRaw} disabled={busy}>
                {t('save')}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setDraft(JSON.stringify(matchers, null, 2))
                  setErr('')
                }}
              >
                {t('discard')}
              </button>
            </div>
          </>
        ) : (
          <>
            {matchers.length === 0 && <div className="st-empty">{t('hookEmpty')}</div>}
            {matchers.map((m, i) => (
              <div key={i} className="hook-matcher">
                <div className="hook-matcher-head">
                  <input
                    className="hook-match-input"
                    placeholder={t('hookMatcherPh')}
                    value={m.matcher ?? ''}
                    onChange={(e) => patch(i, { matcher: e.target.value })}
                  />
                  <button
                    className="st-mini danger"
                    onClick={() => setMatchers((l) => l.filter((_, idx) => idx !== i))}
                  >
                    ×
                  </button>
                </div>
                {(m.hooks || []).map((h, j) => (
                  <div key={j} className="hook-cmd">
                    <textarea
                      placeholder={t('hookCommandPh')}
                      value={h.command ?? ''}
                      onChange={(e) => patchCmd(i, j, { command: e.target.value })}
                    />
                    <div className="hook-cmd-foot">
                      <input
                        className="hook-timeout"
                        type="number"
                        placeholder={t('hookTimeoutPh')}
                        value={h.timeout ?? ''}
                        onChange={(e) =>
                          patchCmd(i, j, {
                            timeout: e.target.value ? Number(e.target.value) : undefined
                          })
                        }
                      />
                      <button
                        className="st-mini danger"
                        onClick={() =>
                          patch(i, { hooks: (m.hooks || []).filter((_, hj) => hj !== j) })
                        }
                      >
                        {t('hookRemoveCommand')}
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  className="st-mini"
                  onClick={() =>
                    patch(i, { hooks: [...(m.hooks || []), { type: 'command', command: '' }] })
                  }
                >
                  {t('hookAddCommand')}
                </button>
              </div>
            ))}

            <div className="hook-foot">
              <button
                className="btn"
                onClick={() =>
                  setMatchers((l) => [
                    ...l,
                    { matcher: '', hooks: [{ type: 'command', command: '' }] }
                  ])
                }
              >
                {t('hookAddMatcher')}
              </button>
              <button className="btn primary" onClick={() => persist(matchers)} disabled={busy}>
                {t('save')}
              </button>
              <button className="btn danger" onClick={removeEvent}>
                {t('hookDeleteEvent')}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
