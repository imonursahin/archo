import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { bus, type OpenTermRequest } from '../lib/bus'
import SessionTools from './SessionTools'
import { t, ti, getLang } from '../lib/i18n'
import type { Assistant, TermSession, TerminalRec } from '../global'

// URL + file:line matchers for terminal smart links
const URL_RE = /https?:\/\/[^\s"'`)]+/g
const FILE_RE = /(?:^|[\s(])((?:\.{0,2}\/)?[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|c|cpp|h|hpp|css|scss|html|json|md|yaml|yml|toml|sh))(?::(\d+))?/g

const theme = {
  background: '#0a0a0c',
  foreground: '#e4e4e7',
  cursor: '#d97757',
  black: '#0a0a0c',
  brightBlack: '#52525b',
  green: '#4ade80',
  red: '#f87171',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  cyan: '#67e8f9',
  white: '#e4e4e7'
}

// terminals whose PTY was started during this app run
const started = new Set<string>()
// claude session ids already assigned to a terminal (so two terminals in the
// same folder never resume the SAME conversation)
const claimedClaude = new Set<string>()

// pick a distinct claude session for a terminal: prefer the transcript created
// soonest at/after the terminal started, among ids not yet claimed.
function pickClaudeId(
  cands: { id: string; mtime: number }[],
  createdAt: number
): string | null {
  const free = cands.filter((c) => !claimedClaude.has(c.id))
  if (free.length === 0) return null
  const after = free
    .filter((c) => c.mtime >= createdAt - 3000)
    .sort((a, b) => a.mtime - b.mtime)
  return (after[0] || free.sort((a, b) => b.mtime - a.mtime)[0]).id
}

function relTime(ms: number): string {
  const d = Date.now() - ms
  const m = Math.floor(d / 60000)
  if (m < 1) return t('relJustNow')
  if (m < 60) return ti('relMinAgo', { n: m })
  const h = Math.floor(m / 60)
  if (h < 24) return ti('relHourAgo', { n: h })
  return new Date(ms).toLocaleDateString(getLang() === 'tr' ? 'tr-TR' : 'en-US')
}

function TermInstance({
  sessionId,
  term,
  logPath,
  visible
}: {
  sessionId: string
  term: TerminalRec
  logPath: string
  visible: boolean
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const autoStartedRef = useRef(false)
  const [dead, setDead] = useState(false)
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [isClaudeTerm, setIsClaudeTerm] = useState(false)

  useEffect(() => {
    const xterm = new Terminal({
      fontFamily: "'SF Mono', ui-monospace, Menlo, monospace",
      fontSize: 12.5,
      theme,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000
    })
    const fit = new FitAddon()
    xterm.loadAddon(fit)
    xterm.open(hostRef.current!)
    fit.fit()
    xtermRef.current = xterm
    fitRef.current = fit

    // ---- smart links: clickable URLs (open browser) + file:line (insert @path) ----
    const linkProvider = xterm.registerLinkProvider({
      provideLinks(y, cb) {
        const line = xterm.buffer.active.getLine(y - 1)?.translateToString(true)
        if (!line) return cb(undefined)
        const links: {
          range: { start: { x: number; y: number }; end: { x: number; y: number } }
          text: string
          activate: () => void
        }[] = []
        let m: RegExpExecArray | null
        URL_RE.lastIndex = 0
        while ((m = URL_RE.exec(line))) {
          const start = m.index
          const url = m[0]
          links.push({
            text: url,
            range: { start: { x: start + 1, y }, end: { x: start + url.length, y } },
            activate: () => window.api.openExternal(url)
          })
        }
        FILE_RE.lastIndex = 0
        while ((m = FILE_RE.exec(line))) {
          const file = m[1]
          const at = line.indexOf(file, m.index)
          links.push({
            text: file,
            range: { start: { x: at + 1, y }, end: { x: at + file.length, y } },
            activate: () => window.api.ptyWrite(term.id, `@${file} `)
          })
        }
        cb(links.length ? links : undefined)
      }
    })

    // dedup live stream against the snapshot using a seq counter
    let wrote = false
    let snapSeq = -1
    const pending: { seq: number; data: string }[] = []
    // busy/idle detection + done-notification now live in the main process
    // (pty.ts) so they work for ALL terminals, even unmounted ones.

    const offData = window.api.onPtyData((tid, data, seq) => {
      if (tid !== term.id) return
      if (!wrote) pending.push({ seq, data })
      else if (seq > snapSeq) xterm.write(data)
    })
    const offExit = window.api.onPtyExit((tid) => {
      if (tid === term.id) {
        xterm.write(`\r\n\x1b[90m${t('terminalEnded')}\x1b[0m\r\n`)
        setDead(true)
        started.delete(term.id)
      }
    })
    xterm.onData((d) => window.api.ptyWrite(term.id, d))
    // fit reliably even when the container size settles a frame or two after
    // mount (fixes the "half-rendered terminal on resume" until you resize)
    const refit = (): void => {
      try {
        fit.fit()
        window.api.ptyResize(term.id, xterm.cols, xterm.rows)
      } catch {
        /* ignore */
      }
    }
    requestAnimationFrame(refit)
    const refitTimers = [setTimeout(refit, 60), setTimeout(refit, 200)]

    ;(async () => {
      const snap = await window.api.terminalSnapshot(term.id)
      if (snap) {
        // live terminal: replay accumulated buffer, then continue live
        if (snap.buffer) xterm.write(snap.buffer)
        snapSeq = snap.seq
        requestAnimationFrame(refit) // re-fit once the replayed buffer is laid out
      } else {
        // dead terminal — treat as a resumable Claude session ONLY if THIS
        // terminal actually ran claude (captured session id, or its command was
        // `claude`). Do NOT guess from the cwd: a plain shell terminal in a dir
        // where claude was used before is not a claude terminal.
        const claudeId = term.claudeSessionId || null
        const claudeish = !!claudeId || (term.command || '').trim().startsWith('claude')
        if (claudeish) {
          if (claudeId) claimedClaude.add(claudeId)
          setResumeId(claudeId)
          setIsClaudeTerm(true)
        } else {
          const log = await window.api.readTerminalLog(sessionId, term.id)
          if (log) xterm.write(log)
        }
        setDead(true)
      }
      wrote = true
      for (const p of pending) if (p.seq > snapSeq) xterm.write(p.data)
      pending.length = 0
    })()

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        window.api.ptyResize(term.id, xterm.cols, xterm.rows)
      } catch {
        /* ignore */
      }
    })
    ro.observe(hostRef.current!)

    return () => {
      offData()
      offExit()
      ro.disconnect()
      refitTimers.forEach(clearTimeout)
      linkProvider.dispose()
      xterm.dispose() // keep PTY alive; just detach the view
    }
  }, [term.id, sessionId, logPath])

  useEffect(() => {
    if (visible && fitRef.current && xtermRef.current) {
      setTimeout(() => {
        try {
          fitRef.current!.fit()
          window.api.ptyResize(term.id, xtermRef.current!.cols, xtermRef.current!.rows)
          xtermRef.current!.focus()
        } catch {
          /* ignore */
        }
      }, 0)
    }
  }, [visible, term.id])

  async function restart(): Promise<void> {
    const raw = (term.command || '').trim()
    let cmd = ''
    const id = resumeId || term.claudeSessionId
    if (id) {
      cmd = `claude --resume ${id}`
    } else if (isClaudeTerm || raw.startsWith('claude')) {
      cmd = 'claude --continue'
    } else if (raw) {
      cmd = raw
    }
    // claude gets a clean screen for its TUI; a plain shell keeps its scrollback
    // (the recorded history stays visible, the fresh prompt appends below)
    if (cmd) {
      xtermRef.current?.reset()
    } else {
      xtermRef.current?.write('\r\n')
    }
    window.api.ptyCreate(term.id, {
      cwd: term.cwd,
      command: cmd || undefined,
      silent: !!cmd, // run the resume command without echoing it
      recordPath: logPath
    })
    started.add(term.id)
    setDead(false)
    xtermRef.current?.focus()
  }

  // a plain (non-claude) dead terminal → auto-start a fresh shell the first time
  // it's viewed, so you can just type (history stays visible above). A later
  // manual `exit` won't re-spawn (shows the restart bar instead).
  useEffect(() => {
    if (visible && dead && !isClaudeTerm && !autoStartedRef.current) {
      autoStartedRef.current = true
      restart()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, dead, isClaudeTerm])

  return (
    <div className={`xterm-wrap ${visible ? '' : 'hidden'}`}>
      <div className="xterm-host" ref={hostRef} />
      {/* claude: centered resume card (no meaningful scrollback to show) */}
      {dead && isClaudeTerm && (
        <div className="term-dead">
          <div className="resume-card">
            <div className="resume-icon">✳</div>
            <div className="resume-title">{t('claudeSession')}</div>
            <div className="resume-sub">
              {resumeId ? t('resumeConversation') : t('resumeLast')}
            </div>
            <button className="btn primary" onClick={restart}>
              {t('resume')}
            </button>
          </div>
        </div>
      )}
      {/* plain terminal: keep the recorded history visible, small restart bar */}
      {dead && !isClaudeTerm && (
        <div className="term-dead-bar">
          <span className="term-dead-label">{t('terminalEnded')}</span>
          <button className="btn primary sm" onClick={restart}>
            {term.command ? t('restart') : t('start')}
          </button>
        </div>
      )}
    </div>
  )
}

interface Props {
  assistant: Assistant
  // set by a notification click → open this session and focus this terminal
  openTarget?: { sessionId: string; terminalId?: string } | null
  onSessionOpened?: () => void
  onActiveTerminal?: (id: string | null) => void
}

export default function SessionsView({
  assistant,
  openTarget,
  onSessionOpened,
  onActiveTerminal
}: Props): JSX.Element {
  const [sessions, setSessions] = useState<TermSession[]>([])
  const [open, setOpen] = useState<TermSession | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [logPaths, setLogPaths] = useState<Record<string, string>>({})
  const [editingName, setEditingName] = useState(false)
  const [editingTab, setEditingTab] = useState<string | null>(null)
  const [sessQuery, setSessQuery] = useState('')
  const [splitId, setSplitId] = useState<string | null>(null) // second pane for split view
  const [tagInput, setTagInput] = useState('')

  async function saveTags(tags: string[]): Promise<void> {
    if (!open) return
    setOpen({ ...open, tags })
    await window.api.updateSessionMeta(open.id, { tags })
    reload()
  }
  function addTag(): void {
    const v = tagInput.trim().replace(/^#/, '')
    if (!v || !open) return
    const tags = open.tags || []
    if (!tags.includes(v)) saveTags([...tags, v])
    setTagInput('')
  }

  function toggleSplit(): void {
    if (splitId) {
      setSplitId(null)
      return
    }
    const other = open?.terminals.find((t) => t.id !== active)
    if (other) setSplitId(other.id)
  }

  const shownSessions = sessQuery.trim()
    ? sessions.filter((s) => s.name.toLowerCase().includes(sessQuery.toLowerCase()))
    : sessions

  // group sessions into date buckets (newest-first list assumed)
  const grouped = (() => {
    const now = new Date()
    const startOfDay = (d: Date): number => {
      const x = new Date(d)
      x.setHours(0, 0, 0, 0)
      return x.getTime()
    }
    const today = startOfDay(now)
    const yesterday = today - 86400000
    const week = today - 6 * 86400000
    const month = today - 29 * 86400000
    const pinned: TermSession[] = []
    const buckets: { label: string; items: TermSession[] }[] = [
      { label: t('bucketToday'), items: [] },
      { label: t('bucketYesterday'), items: [] },
      { label: t('bucketThisWeek'), items: [] },
      { label: t('bucketThisMonth'), items: [] },
      { label: t('bucketOlder'), items: [] }
    ]
    for (const s of shownSessions) {
      if (s.pinned) {
        pinned.push(s)
        continue
      }
      const c = s.createdAt
      if (c >= today) buckets[0].items.push(s)
      else if (c >= yesterday) buckets[1].items.push(s)
      else if (c >= week) buckets[2].items.push(s)
      else if (c >= month) buckets[3].items.push(s)
      else buckets[4].items.push(s)
    }
    const out = buckets.filter((b) => b.items.length)
    if (pinned.length) out.unshift({ label: t('bucketPinned'), items: pinned })
    return out
  })()

  async function togglePin(s: TermSession): Promise<void> {
    const pinned = !s.pinned
    setSessions((list) => list.map((x) => (x.id === s.id ? { ...x, pinned } : x)))
    await window.api.updateSessionMeta(s.id, { pinned })
  }

  function reload(): void {
    window.api.listTermSessions(assistant.id).then(setSessions)
  }
  useEffect(reload, [assistant.id])

  // report the currently-focused terminal up (App suppresses its notification)
  useEffect(() => {
    onActiveTerminal?.(open ? active : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, open])

  // keep the left-list card (terminal count) in sync as terminals are added/closed
  useEffect(() => {
    if (!open) return
    setSessions((prev) =>
      prev.map((s) => (s.id === open.id ? { ...s, terminals: open.terminals } : s))
    )
  }, [open?.id, open?.terminals.length])

  async function newSession(): Promise<void> {
    const s = await window.api.createTermSession(assistant.id, '') // main auto-names "Session N"
    reload()
    enter(s)
  }

  async function enter(s: TermSession, focusTermId?: string): Promise<void> {
    const full = (await window.api.getTermSession(s.id)) || s
    // resolve deterministic log paths for existing terminals
    const entries = await Promise.all(
      full.terminals.map(
        async (t) => [t.id, await window.api.terminalLogPath(full.id, t.id)] as const
      )
    )
    setLogPaths((p) => ({ ...p, ...Object.fromEntries(entries) }))
    setOpen(full)
    // focus the requested terminal (from a notification click), else the FIRST one
    const wanted = focusTermId && full.terminals.some((t) => t.id === focusTermId) ? focusTermId : null
    setActive(wanted ?? full.terminals[0]?.id ?? null)
  }

  // notification click → open the requested session + focus its terminal once loaded
  useEffect(() => {
    if (!openTarget) return
    const s = sessions.find((x) => x.id === openTarget.sessionId)
    if (s) {
      enter(s, openTarget.terminalId)
      onSessionOpened?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTarget, sessions])

  // After launching a claude terminal, poll for the transcript it creates and
  // record its session id so we can later `--resume <id>` exactly this chat.
  function captureClaude(sessId: string, t: { id: string; command?: string; cwd?: string }): void {
    if (!t.command || !t.command.trim().startsWith('claude') || !t.cwd) return
    const since = Date.now()
    let tries = 0
    const timer = setInterval(async () => {
      tries++
      const cands = t.cwd ? await window.api.detectClaudeSessions(t.cwd, since) : []
      const id = pickClaudeId(cands, since)
      if (id) {
        clearInterval(timer)
        claimedClaude.add(id)
        await window.api.setTerminalClaude(sessId, t.id, id)
        setOpen((o) =>
          o
            ? {
                ...o,
                terminals: o.terminals.map((x) =>
                  x.id === t.id ? { ...x, claudeSessionId: id } : x
                )
              }
            : o
        )
      } else if (tries > 12) {
        clearInterval(timer)
      }
    }, 1500)
  }

  async function addTerminal(opts?: { name?: string; cwd?: string; command?: string }): Promise<void> {
    if (!open) return
    const { terminal, logPath } = await window.api.addTerminal(open.id, {
      cwd: opts?.cwd ?? open.cwd ?? assistant.baseDir,
      command: opts?.command,
      name: opts?.name
    })
    window.api.ptyCreate(terminal.id, {
      cwd: terminal.cwd,
      command: terminal.command,
      silent: !!terminal.command,
      recordPath: logPath
    })
    started.add(terminal.id)
    setLogPaths((p) => ({ ...p, [terminal.id]: logPath }))
    setOpen((o) => (o ? { ...o, terminals: [...o.terminals, terminal] } : o))
    setActive(terminal.id)
    captureClaude(open.id, terminal)
  }

  // "▶ Çalıştır" (assistant) and session resume route through the bus
  useEffect(() => {
    return bus.on<OpenTermRequest>('openTerm', async (req) => {
      let sess = open
      if (!sess) {
        sess = await window.api.createTermSession(assistant.id, req.name || 'run')
        reload()
        await enter(sess)
      }
      // add terminal into the (now) open session
      const { terminal, logPath } = await window.api.addTerminal(sess.id, {
        cwd: req.cwd,
        command: req.command,
        name: req.name
      })
      window.api.ptyCreate(terminal.id, {
        cwd: terminal.cwd,
        command: terminal.command,
        silent: !!terminal.command,
        recordPath: logPath
      })
      started.add(terminal.id)
      setLogPaths((p) => ({ ...p, [terminal.id]: logPath }))
      setOpen((o) => (o ? { ...o, terminals: [...o.terminals, terminal] } : o))
      setActive(terminal.id)
      captureClaude(sess.id, terminal)
    })
  }, [open, assistant.id])

  async function closeTerminal(id: string): Promise<void> {
    window.api.ptyKill(id)
    if (open) await window.api.removeTerminal(open.id, id)
    started.delete(id)
    setOpen((o) => (o ? { ...o, terminals: o.terminals.filter((t) => t.id !== id) } : o))
    if (active === id) {
      const rest = open?.terminals.filter((t) => t.id !== id) ?? []
      setActive(rest[rest.length - 1]?.id ?? null)
    }
  }

  async function deleteSession(id: string): Promise<void> {
    if (!confirm(t('confirmDeleteSession'))) return
    // kill this session's live terminals and clear the detail pane if it's open
    const target = sessions.find((s) => s.id === id)
    target?.terminals.forEach((t) => {
      window.api.ptyKill(t.id)
      started.delete(t.id)
    })
    if (open?.id === id) {
      setOpen(null)
      setActive(null)
    }
    await window.api.deleteTermSession(id)
    reload()
  }

  // ---------- Master-detail split ----------
  return (
    <div className="ss-split">
      {/* LEFT: scrollable session list */}
      <div className="ss-left">
        <div className="ss-left-head">
          <h2>{t('sessions')}</h2>
        </div>
        <div className="ss-search">
          <input
            placeholder={t('searchSessionPh')}
            value={sessQuery}
            onChange={(e) => setSessQuery(e.target.value)}
          />
        </div>
        <button className="ss-new" onClick={newSession}>
          {t('newSessionPlus')}
        </button>
        <div className="ss-list">
          {sessions.length === 0 && <div className="ss-empty-hint">{t('noSessionsYet')}</div>}
          {shownSessions.length === 0 && sessions.length > 0 && (
            <div className="ss-empty-hint">{t('noMatchingSession')}</div>
          )}
          {grouped.map((g) => (
            <div key={g.label} className="ss-group">
              <div className="ss-group-head">{g.label}</div>
              {g.items.map((s) => (
                <div
                  key={s.id}
                  className={`ss-item ${open?.id === s.id ? 'active' : ''}`}
                  onClick={() => enter(s)}
                >
                  <div className="ss-item-top">
                    <span className="slv-icon">▤</span>
                    <span className="ss-item-name">{s.name}</span>
                    <button
                      className={`ss-pin ${s.pinned ? 'on' : ''}`}
                      title={s.pinned ? t('unpin') : t('pin')}
                      onClick={(e) => {
                        e.stopPropagation()
                        togglePin(s)
                      }}
                    >
                      📌
                    </button>
                    <button
                      className="ac-del"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteSession(s.id)
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <div className="ss-item-meta">
                    {ti('nTerminal', { n: s.terminals.length })} · {relTime(s.createdAt)}
                  </div>
                  {s.tags && s.tags.length > 0 && (
                    <div className="ss-item-tags">
                      {s.tags.map((tag) => (
                        <span key={tag} className="si-tag mini">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: selected session detail */}
      <div className="ss-right">
        {!open ? (
          <div className="empty">
            <div className="big">{t('pickSessionBig')}</div>
            <div>{t('pickSessionSub')}</div>
          </div>
        ) : (
          <div className="session-inside">
            <div className="si-head">
              {editingName ? (
                <input
                  key={open.id}
                  className="si-name-input"
                  autoFocus
                  defaultValue={open.name}
                  onBlur={async (e) => {
                    const v = e.target.value.trim() || open.name
                    setOpen({ ...open, name: v })
                    setEditingName(false)
                    await window.api.renameTermSession(open.id, v)
                    reload()
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                />
              ) : (
                <span
                  className="si-name"
                  onDoubleClick={() => setEditingName(true)}
                  title={t('doubleClickRename')}
                >
                  ▤ {open.name}
                </span>
              )}
            </div>

            <div className="si-meta">
              <div className="si-tags">
                {(open.tags || []).map((tag) => (
                  <span key={tag} className="si-tag">
                    #{tag}
                    <span
                      className="si-tag-x"
                      title={t('removeTag')}
                      onClick={() => saveTags((open.tags || []).filter((x) => x !== tag))}
                    >
                      ×
                    </span>
                  </span>
                ))}
                <input
                  className="si-tag-input"
                  placeholder={t('tagPlaceholder')}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault()
                      addTag()
                    }
                  }}
                  onBlur={addTag}
                />
              </div>
            </div>

            <SessionTools
              session={open}
              assistantId={assistant.id}
              activeTerminalId={active}
              fallbackCwd={assistant.baseDir}
              onChanged={reload}
              onLocalPatch={(patch) => setOpen((o) => (o ? { ...o, ...patch } : o))}
              onNewTerminal={(opts) => addTerminal(opts)}
            />

            <div className="si-tabs">
              {open.terminals.map((t) => (
                <div
                  key={t.id}
                  className={`term-tab ${active === t.id ? 'active' : ''}`}
                  onClick={() => setActive(t.id)}
                  onDoubleClick={() => setEditingTab(t.id)}
                >
                  <span className="rec" />
                  {editingTab === t.id ? (
                    <input
                      autoFocus
                      defaultValue={t.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim() || t.name
                        window.api.renameTerminal(open.id, t.id, v)
                        setOpen({
                          ...open,
                          terminals: open.terminals.map((x) =>
                            x.id === t.id ? { ...x, name: v } : x
                          )
                        })
                        setEditingTab(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      }}
                    />
                  ) : (
                    <span>{t.name}</span>
                  )}
                  <span
                    className="close"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTerminal(t.id)
                    }}
                  >
                    ×
                  </span>
                </div>
              ))}
              <button className="term-new" onClick={() => addTerminal()} title={t('newTerminal')}>
                ＋
              </button>
              {open.terminals.length >= 2 && (
                <button
                  className={`term-split ${splitId ? 'on' : ''}`}
                  onClick={toggleSplit}
                  title={splitId ? t('closeSplit') : t('splitSideBySide')}
                >
                  ⊞
                </button>
              )}
            </div>

            <div className={`si-host ${splitId ? 'split' : ''}`}>
              {open.terminals.length === 0 ? (
                <div className="empty">
                  <div className="big">{t('emptySession')}</div>
                  <div>{t('emptySessionSub')}</div>
                </div>
              ) : (
                open.terminals.map((t) => {
                  const shown = active === t.id || splitId === t.id
                  return (
                    <div key={t.id} className={`si-pane ${shown ? '' : 'pane-hidden'}`}>
                      {splitId && shown && (
                        <div className="pane-label">{t.name}</div>
                      )}
                      <TermInstance
                        sessionId={open.id}
                        term={t}
                        logPath={logPaths[t.id] || ''}
                        visible={shown}
                      />
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
