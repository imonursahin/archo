import { useEffect, useState } from 'react'
import type { TermSession } from '../global'
import {
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

type Panel = 'files' | 'prompts' | null
interface FileEntry {
  key: string
  label: string // shown text (relative path)
  insert: string // what goes after @ (relative for cwd, absolute for extra dirs)
  badge: string // extra-dir short name, '' for cwd
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
  // @file picker entries — cwd files (relative) + extra picked dirs (absolute)
  const [files, setFiles] = useState<FileEntry[] | null>(null)
  const [extraRoots, setExtraRoots] = useState<string[]>([])
  const [fileQuery, setFileQuery] = useState('')
  const [prompts, setPrompts] = useState<SavedPrompt[]>(getPrompts())
  const [editing, setEditing] = useState<SavedPrompt | null>(null)
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

  useEffect(() => {
    if (panel !== 'files') return
    let alive = true
    setFiles(null)
    // load cwd (relative @paths) + each extra dir (absolute @paths)
    const roots = [{ dir: cwd, external: false }, ...extraRoots.map((d) => ({ dir: d, external: true }))]
    Promise.all(
      roots.map(async ({ dir, external }) => {
        const list = await window.api.listFiles(dir)
        const short = dir.replace(/^.*\/(?=[^/]+$)/, '')
        return list.map((rel) => ({
          key: `${dir}/${rel}`,
          label: rel,
          insert: external ? `${dir.replace(/\/$/, '')}/${rel}` : rel,
          badge: external ? short : ''
        }))
      })
    ).then((groups) => {
      if (alive) setFiles(groups.flat())
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, cwd, extraRoots])

  async function addRoot(): Promise<void> {
    const r = await window.api.pickDir(cwd)
    if (r.ok && r.path && !extraRoots.includes(r.path) && r.path !== cwd) {
      setExtraRoots((prev) => [...prev, r.path!])
    }
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
    inject(p.text)
    if (activeTerminalId) {
      toast(ti('toastPromptSent', { name: p.title }), 'success')
      setPanel(null)
    }
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

  const filteredFiles = (files || []).filter((f) =>
    fileQuery
      ? (f.badge + '/' + f.label).toLowerCase().includes(fileQuery.toLowerCase())
      : true
  )

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
                {Math.round(usage.durationMs / 60000)}dk
              </>
            )}
          </span>
        )}

        <div className="st-actions">
          <select
            className="st-model"
            value={model}
            title="Model"
            onChange={(e) => setModelEffort({ model: e.target.value })}
          >
            <option value="">{t('modelAuto')}</option>
            <option value="opus">opus</option>
            <option value="sonnet">sonnet</option>
            <option value="haiku">haiku</option>
          </select>
          <select
            className="st-model"
            value={effort}
            title={t('reasoningEffort')}
            onChange={(e) => setModelEffort({ effort: e.target.value })}
          >
            <option value="">{t('effortAuto')}</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
          <button className="st-btn primary" onClick={startClaude} title={t('startClaudeTitle')}>
            <Icon name="play" size={13} /> Claude
          </button>
          <span className="st-sep" />
          <button
            className={`st-btn ${panel === 'files' ? 'active' : ''}`}
            onClick={() => setPanel(panel === 'files' ? null : 'files')}
          >
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

      {panel === 'files' && (
        <div className="st-panel">
          <div className="st-file-top">
            <input
              className="st-search"
              autoFocus
              placeholder={t('fileSearchPh')}
              value={fileQuery}
              onChange={(e) => setFileQuery(e.target.value)}
            />
            <button className="st-mini" onClick={addRoot} title={t('addDirTitle')}>
              {t('addDir')}
            </button>
          </div>
          {extraRoots.length > 0 && (
            <div className="st-roots">
              <span className="st-root-chip cwd" title={cwd}>📁 {cwd.replace(/^.*\/(?=[^/]+$)/, '')} (cwd)</span>
              {extraRoots.map((d) => (
                <span key={d} className="st-root-chip" title={d}>
                  📁 {d.replace(/^.*\/(?=[^/]+$)/, '')}
                  <span
                    className="st-root-x"
                    onClick={() => setExtraRoots((p) => p.filter((x) => x !== d))}
                  >
                    ×
                  </span>
                </span>
              ))}
            </div>
          )}
          {files === null && <div className="st-empty">{t('loading')}</div>}
          {files !== null && filteredFiles.length === 0 && (
            <div className="st-empty">{t('noFilesFound')}</div>
          )}
          <div className="st-files">
            {filteredFiles.slice(0, 300).map((f) => (
              <div
                key={f.key}
                className="st-file-row"
                title={f.insert}
                onClick={() => inject(`@${f.insert} `)}
              >
                <span className="st-at">@</span>
                {f.badge && <span className="st-file-badge">{f.badge}</span>}
                <span className="st-file-path">{f.label}</span>
              </div>
            ))}
            {filteredFiles.length > 300 && (
              <div className="st-empty">{ti('moreFiles', { n: filteredFiles.length - 300 })}</div>
            )}
          </div>
        </div>
      )}

      {panel === 'prompts' && (
        <div className="st-panel">
          <div className="st-panel-head">
            <span>{t('savedPrompts')}</span>
            <button
              className="st-mini primary"
              onClick={() => setEditing({ id: `p-${Date.now()}`, title: '', text: '' })}
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
          {prompts.map((p) => (
            <div key={p.id} className="st-prompt">
              <span className="st-prompt-title" onClick={() => sendPrompt(p)} title={p.text}>
                {p.title}
              </span>
              <button className="st-mini" onClick={() => sendPrompt(p)}>
                {t('send')}
              </button>
              <button className="st-mini" onClick={() => setEditing(p)}>
                ✎
              </button>
              <button
                className="st-mini danger"
                onClick={() => {
                  const next = prompts.filter((x) => x.id !== p.id)
                  setPrompts(next)
                  savePrompts(next)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
