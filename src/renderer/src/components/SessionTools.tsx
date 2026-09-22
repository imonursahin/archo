import { useEffect, useState, type MouseEvent } from 'react'
import type { TermSession } from '../global'
import {
  getPrefs,
  getPrompts,
  savePrompts,
  getRecentDirs,
  pushRecentDir,
  removeRecentDir,
  type SavedPrompt
} from '../lib/prefs'
import { toast } from '../lib/toast'
import { t, ti } from '../lib/i18n'

import Icon from './Icon'

interface Props {
  session: TermSession
  assistantId: string
  activeTerminalId: string | null
  fallbackCwd: string
  onChanged: () => void
  onLocalPatch: (patch: Partial<TermSession>) => void
  onNewTerminal: (opts: { name?: string; command?: string }) => void
}

type Panel = 'prompts' | null
const PROMPT_VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g

function promptVars(text: string): string[] {
  const seen: string[] = []
  for (const m of text.matchAll(PROMPT_VAR_RE)) if (!seen.includes(m[1])) seen.push(m[1])
  return seen
}
function fillVars(text: string, values: Record<string, string>): string {
  return text.replace(PROMPT_VAR_RE, (whole, name) => values[name] ?? whole)
}

export default function SessionTools({
  session,
  assistantId,
  activeTerminalId,
  fallbackCwd,
  onChanged,
  onLocalPatch,
  onNewTerminal
}: Props): JSX.Element {
  const [panel, setPanel] = useState<Panel>(null)
  const [startRect, setStartRect] = useState<DOMRect | null>(null) // Claude button, for its popup
  const [prompts, setPrompts] = useState<SavedPrompt[]>(getPrompts())
  const [editing, setEditing] = useState<SavedPrompt | null>(null)
  const [filling, setFilling] = useState<{
    prompt: SavedPrompt
    vars: string[]
    values: Record<string, string>
  } | null>(null)
  const [showRecent, setShowRecent] = useState(false)
  const [, setRecentTick] = useState(0)
  const [branch, setBranch] = useState<{ isRepo: boolean; branch?: string; dirty?: boolean }>({
    isRepo: false
  })
  const [bridge, setBridge] = useState<{ bridged: boolean; count?: number }>({ bridged: false })
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof window.api.sessionUsage>> | null>(
    null
  )

  const cwd = session.cwd || fallbackCwd
  const model = session.model || ''
  const effort = session.effort || ''
  const activeTerm = session.terminals.find((t) => t.id === activeTerminalId)
  const claudeId = activeTerm?.claudeSessionId

  function claudeArgs(): string {
    let a = ''
    if (model) a += ` --model ${model}`
    if (effort) a += ` --effort ${effort}`
    return a
  }
  async function setModelEffort(patch: { model?: string; effort?: string }): Promise<void> {
    await window.api.updateSessionMeta(session.id, patch)
    onLocalPatch(patch)
  }
  function startClaude(): void {
    setStartRect(null)
    onNewTerminal({ name: 'claude', command: `claude${claudeArgs()}` })
  }

  // git branch of the working dir
  useEffect(() => {
    window.api.gitBranch(cwd).then(setBranch)
  }, [cwd])

  // live context budget + cost from the active claude transcript
  useEffect(() => {
    if (!claudeId) {
      setUsage(null)
      return
    }
    let alive = true
    const load = (): void => {
      window.api.sessionUsage(cwd, claudeId).then((u) => alive && setUsage(u))
    }
    load()
    const t = setInterval(load, 15000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [cwd, claudeId])
  const shortCwd = cwd.replace(/^.*\/(?=[^/]+\/[^/]+$)/, '…/')
  const recent = getRecentDirs(assistantId).filter((d) => d !== cwd)

  // the terminal takes a path from anywhere on disk, so this is the OS picker
  // rather than a listing of the working directory
  async function pickFiles(): Promise<void> {
    if (!requireTerm()) return
    const r = await window.api.pickFiles(cwd)
    if (!r.ok || r.paths.length === 0) return
    inject(r.paths.map((p) => `@${p}`).join(' ') + ' ')
  }

  function requireTerm(): boolean {
    if (!activeTerminalId) {
      toast(t('toastOpenTerminalFirst'), 'warn')
      return false
    }
    return true
  }
  function inject(text: string): void {
    if (!requireTerm()) return
    window.api.ptyWrite(activeTerminalId!, text)
  }

  async function setCwd(dir: string): Promise<void> {
    await window.api.setSessionCwd(session.id, dir)
    pushRecentDir(assistantId, dir)
    onLocalPatch({ cwd: dir })
    onChanged()
    setShowRecent(false)
    toast(t('toastCwdSet'), 'success')
  }
  async function pickDir(): Promise<void> {
    const r = await window.api.pickDir(cwd)
    if (r.ok && r.path) setCwd(r.path)
  }

  // is the working dir a different repo than the assistant itself?
  const isExternal = cwd.replace(/\/$/, '') !== fallbackCwd.replace(/\/$/, '')
  useEffect(() => {
    if (isExternal) window.api.bridgeStatus(cwd).then(setBridge)
    else setBridge({ bridged: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, isExternal])

  async function toggleBridge(): Promise<void> {
    if (bridge.bridged) {
      await window.api.unlinkSkills(cwd)
      setBridge({ bridged: false })
      toast(t('toastBridgeRemoved'), 'success')
    } else {
      const r = await window.api.linkSkills(assistantId, cwd)
      if (r.ok) {
        setBridge({ bridged: true, count: r.linked })
        toast(ti('toastBridgeLinked', { n: r.linked ?? 0 }), 'success')
      } else {
        toast(r.error || t('toastBridgeFailed'), 'error')
      }
    }
  }

  // ---- prompt library ----
  function sendPrompt(p: SavedPrompt): void {
    const vars = promptVars(p.text)
    if (vars.length) {
      if (!requireTerm()) return
      setEditing(null)
      setFilling({ prompt: p, vars, values: Object.fromEntries(vars.map((v) => [v, ''])) })
      return
    }
    inject(p.text)
    if (activeTerminalId) {
      toast(ti('toastPromptSent', { name: p.title }), 'success')
      setPanel(null)
    }
  }
  function removePrompt(p: SavedPrompt): void {
    if (getPrefs().confirmDelete && !confirm(ti('confirmDeletePrompt', { name: p.title }))) return
    const next = prompts.filter((x) => x.id !== p.id)
    setPrompts(next)
    savePrompts(next)
  }

  function sendFilled(): void {
    if (!filling) return
    inject(fillVars(filling.prompt.text, filling.values))
    if (activeTerminalId) {
      toast(ti('toastPromptSent', { name: filling.prompt.title }), 'success')
      setPanel(null)
    }
    setFilling(null)
  }
  function savePrompt(): void {
    if (!editing) return
    const title = editing.title.trim()
    const text = editing.text.trim()
    if (!title || !text) return
    const next = prompts.some((p) => p.id === editing.id)
      ? prompts.map((p) => (p.id === editing.id ? editing : p))
      : [...prompts, editing]
    setPrompts(next)
    savePrompts(next)
    setEditing(null)
  }

  return (
    <div className="st-wrap">
      <div className="st-bar">
        <div className="st-cwd-wrap">
          <button className="st-cwd" onClick={pickDir} title={cwd}>
            <Icon name="folder" size={13} />
            <span className="st-cwd-txt">{shortCwd || t('pickWorkingDir')}</span>
          </button>
          {recent.length > 0 && (
            <button
              className="st-cwd-more"
              title={t('recentDirs')}
              onClick={() => setShowRecent((v) => !v)}
            >
              <Icon name="chevron-down" size={12} />
            </button>
          )}
          {showRecent && (
            <div className="st-recent">
              {recent.length === 0 && <div className="st-recent-empty">{t('noRecentDirs')}</div>}
              {recent.map((d) => (
                <div key={d} className="st-recent-row">
                  <button className="st-recent-go" title={d} onClick={() => setCwd(d)}>
                    <Icon name="folder" size={12} /> {d.replace(/^.*\/(?=[^/]+\/[^/]+$)/, '…/')}
                  </button>
                  <span
                    className="st-recent-x"
                    title={t('removeFromHistory')}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeRecentDir(assistantId, d)
                      setRecentTick((x) => x + 1)
                    }}
                  >
                    ×
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {branch.isRepo && (
          <span className="st-branch" title={t('activeGitBranch')}>
            <Icon name="branch" size={12} /> {branch.branch}
            {branch.dirty && <span className="st-branch-dot" title={t('hasChanges')} />}
          </span>
        )}

        {usage?.ok && (
          <span
            className={`st-budget ${usage.contextPct >= 80 ? 'warn' : ''}`}
            title={`Context: ${Math.round(usage.contextTokens / 1000)}K / ${Math.round(
              usage.contextWindow / 1000
            )}K · ${ti('nMessages', { n: usage.messages })}`}
          >
            <Icon name="gauge" size={12} /> %{Math.round(usage.contextPct)}
            <span className="st-budget-sep">·</span>${usage.cost.toFixed(2)}
            {usage.durationMs > 0 && (
              <>
                <span className="st-budget-sep">·</span>
                {Math.round(usage.durationMs / 60000)}
                {t('minUnit')}
              </>
            )}
          </span>
        )}

        <div className="st-actions">
          <button
            className="st-btn primary"
            onClick={(e: MouseEvent<HTMLButtonElement>) =>
              setStartRect(startRect ? null : e.currentTarget.getBoundingClientRect())
            }
            title={t('startClaudeTitle')}
          >
            <Icon name="play" size={13} /> Claude
          </button>
          {startRect && (
            <div
              className="tab-pop start-pop"
              onClick={(e) => e.stopPropagation()}
              style={{ position: 'fixed', top: startRect.bottom + 4, left: Math.max(8, startRect.right - 210) }}
            >
              <div className="muted">Model</div>
              <div className="start-opts">
                {[
                  ['', t('modelAuto')],
                  ['fable', 'fable'],
                  ['opus', 'opus'],
                  ['sonnet', 'sonnet'],
                  ['haiku', 'haiku']
                ].map(
                  ([v, label]) => (
                    <button
                      key={v || 'auto'}
                      className={`st-mini ${model === v ? 'primary' : ''}`}
                      onClick={() => setModelEffort({ model: v })}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
              <div className="muted">{t('reasoningEffort')}</div>
              <div className="start-opts">
                {[['', t('effortAuto')], ['low', 'low'], ['medium', 'medium'], ['high', 'high']].map(
                  ([v, label]) => (
                    <button
                      key={v || 'auto'}
                      className={`st-mini ${effort === v ? 'primary' : ''}`}
                      onClick={() => setModelEffort({ effort: v })}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
              <div className="start-pop-foot">
                <button className="btn" onClick={() => setStartRect(null)}>
                  {t('cancel')}
                </button>
                <button className="btn primary" onClick={startClaude}>
                  {t('startClaude')}
                </button>
              </div>
            </div>
          )}
          <span className="st-sep" />
          <button className="st-btn" onClick={pickFiles} title={t('filesTitle')}>
            <Icon name="file" size={14} /> {t('files')}
          </button>
          <button
            className={`st-btn ${panel === 'prompts' ? 'active' : ''}`}
            onClick={() => setPanel(panel === 'prompts' ? null : 'prompts')}
          >
            <Icon name="message" size={14} /> {t('prompts')}
          </button>
          {isExternal && (
            <button
              className={`st-btn ${bridge.bridged ? 'active' : ''}`}
              onClick={toggleBridge}
              title={t('bridgeTitle')}
            >
              <Icon name="link" size={14} /> {bridge.bridged ? ti('bridgeLinked', { count: bridge.count ?? '' }) : t('bridgeLink')}
            </button>
          )}
        </div>
      </div>

      {panel === 'prompts' && (
        <div className="st-panel">
          <div className="st-panel-head">
            <span>{t('savedPrompts')}</span>
            <button
              className="st-mini primary"
              onClick={() => {
                setFilling(null)
                setEditing({ id: `p-${Date.now()}`, title: '', text: '' })
              }}
            >
              {t('newPlus')}
            </button>
          </div>
          {editing && (
            <div className="st-prompt-edit">
              <input
                placeholder={t('titlePlaceholder')}
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
              <textarea
                placeholder={t('promptTextPlaceholder')}
                value={editing.text}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              />
              <div className="st-prompt-edit-foot">
                <button className="st-mini primary" onClick={savePrompt}>
                  {t('save')}
                </button>
                <button className="st-mini" onClick={() => setEditing(null)}>
                  {t('discard')}
                </button>
              </div>
            </div>
          )}
          {filling && (
            <div className="st-prompt-edit">
              <div className="st-fill-head">{ti('fillVarsFor', { name: filling.prompt.title })}</div>
              {filling.vars.map((v, i) => (
                <input
                  key={v}
                  autoFocus={i === 0}
                  placeholder={v}
                  value={filling.values[v]}
                  onChange={(e) =>
                    setFilling({ ...filling, values: { ...filling.values, [v]: e.target.value } })
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendFilled()
                    if (e.key === 'Escape') setFilling(null)
                  }}
                />
              ))}
              <div className="st-prompt-edit-foot">
                <button className="st-mini primary" onClick={sendFilled}>
                  {t('send')}
                </button>
                <button className="st-mini" onClick={() => setFilling(null)}>
                  {t('discard')}
                </button>
              </div>
            </div>
          )}
          {prompts.map((p) => (
            <div key={p.id} className="st-prompt">
              <span className="st-prompt-title" onClick={() => sendPrompt(p)} title={p.text}>
                {p.title}
              </span>
              <button className="st-mini" onClick={() => sendPrompt(p)}>
                {t('send')}
              </button>
              <button
                className="st-mini"
                onClick={() => {
                  setFilling(null)
                  setEditing(p)
                }}
              >
                ✎
              </button>
              <button className="st-mini danger" onClick={() => removePrompt(p)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
