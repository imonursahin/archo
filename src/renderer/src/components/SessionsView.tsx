import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'
import { bus, type OpenTermRequest } from '../lib/bus'
import SessionTools from './SessionTools'
import Icon from './Icon'
import { t, ti, getLang } from '../lib/i18n'
import { getPrefs } from '../lib/prefs'
import { toast } from '../lib/toast'
import type { Assistant, TermSession, TerminalRec, JiraItem } from '../global'

// inside the terminal-tab map the loop variable is named `t`, which shadows the
// translator — use this alias there
const tx = t

// URL + file:line matchers for terminal smart links
const URL_RE = /https?:\/\/[^\s"'`)]+/g
const FILE_RE = /(?:^|[\s(])((?:\.{0,2}\/)?[\w./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|php|c|cpp|h|hpp|css|scss|html|json|md|yaml|yml|toml|sh))(?::(\d+))?/g

const theme = {
  background: '#0a0a0c',
  foreground: '#e4e4e7',
  cursor: '#d97757',
  selectionBackground: '#3b3b45',
  selectionForeground: '#ffffff',
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

// a typed line that starts a NEW claude conversation (one that hasn't already
// been told which conversation to open)
const CLAUDE_LINE_RE = /^claude(\s|$)/
const CLAUDE_BOUND_RE = /(^|\s)(--session-id|--resume|-r|--continue|-c)(\s|=|$)/

// most recent real cols/rows any terminal fit to — new terminals share the
// same session pane, so this is a reliable size hint before their own xterm
// has mounted, avoiding the wide/narrow spawn-size guess for the first frame.
let lastKnownSize: { cols: number; rows: number } | null = null

// preset tab colors (first = default/none) — muted but visible on the dark tab bar
const TAB_BGS = ['', '#3a3a42', '#2b4a6f', '#265c43', '#4a2f6b', '#6b2f38', '#6b5320', '#245b5e']
// A few columns narrower than xterm's own fit: TUIs that fill status/footer
// lines to the exact last column (Claude's included, packed with emoji) can
// still clip that last character by a hair on residual sub-pixel drift
// between xterm's column math and actual font metrics — and that drift grows
// with the row's total width/character count, so a fixed 1-column margin
// isn't enough at every terminal size. Reporting a few fewer columns to the
// pty than xterm actually renders leaves a permanent margin that reliably
// absorbs it, at the cost of a few columns of width.
function ptyCols(cols: number): number {
  return Math.max(20, cols - 3)
}

// Which terminal you were last on, per session. Pure UI state, so it lives in
// localStorage rather than the session store — no disk write on every tab click.
const LAST_TERM_KEY = 'lastTerminalBySession'
function lastTermMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LAST_TERM_KEY) || '{}')
  } catch {
    return {}
  }
}
function rememberTerm(sessionId: string, terminalId: string): void {
  const m = lastTermMap()
  m[sessionId] = terminalId
  localStorage.setItem(LAST_TERM_KEY, JSON.stringify(m))
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
  const claudeMarkedRef = useRef(false)
  const [dead, setDead] = useState(false)
  const [resumeId, setResumeId] = useState<string | null>(null)
  const [isClaudeTerm, setIsClaudeTerm] = useState(false)

  useEffect(() => {
    const xterm = new Terminal({
      fontFamily: "'SF Mono', ui-monospace, Menlo, monospace",
      // whole-pixel size: a fractional value (e.g. 12.5) renders to a clean
      // integer device pixel on a Retina (2x) display but stays fractional on
      // a 1x external monitor, where xterm's measured cell width and the
      // actual rounded render drift apart — cutting off the right edge and
      // leaving background fills (e.g. Claude's input-row shading) gappy.
      fontSize: 13,
      theme,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000
    })
    const fit = new FitAddon()
    xterm.loadAddon(fit)
    // Claude's status line packs several emoji (⚡ 📊 ⏱️) next to plain text.
    // xterm's default (pre-Unicode-11) width table misjudges how wide some of
    // those render as, so the accumulated drift across the line clips its
    // last character(s) against the right edge. The unicode11 addon supplies
    // the correct wide-character table so FitAddon's column math matches
    // what's actually drawn.
    xterm.loadAddon(new Unicode11Addon())
    xterm.unicode.activeVersion = '11'
    xterm.open(hostRef.current!)
    // xterm's render service can still be uninitialized the instant after
    // open() — fit() reads its dimensions and throws "Cannot read properties
    // of undefined (reading 'dimensions')" if called before it's ready.
    // requestAnimationFrame(refit) below re-fits safely once it is; this one
    // is just a best-effort head start.
    try {
      fit.fit()
    } catch {
      /* ignore */
    }
    xtermRef.current = xterm
    fitRef.current = fit

    // Answer OSC 10/11 (fg/bg color) queries. TUIs like Claude query the
    // terminal's background to adapt styling (e.g. shading the input area);
    // xterm.js doesn't reply on its own, so we report our colors here.
    const oscColor = (hex: string): string => {
      const h = hex.replace('#', '')
      const [r, g, b] = [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)]
      return `rgb:${r}${r}/${g}${g}/${b}${b}`
    }
    xterm.parser.registerOscHandler(11, (d) => {
      if (d === '?') window.api.ptyWrite(term.id, `\x1b]11;${oscColor(theme.background)}\x07`)
      return true
    })
    xterm.parser.registerOscHandler(10, (d) => {
      if (d === '?') window.api.ptyWrite(term.id, `\x1b]10;${oscColor(theme.foreground)}\x07`)
      return true
    })

    // Cmd+C copies the selection (Ctrl+C stays SIGINT). Cmd+V is left to
    // xterm.js's own native paste handling (it already writes the OS clipboard
    // via the browser's paste event) — handling it here too double-pastes.
    // Shift+Enter inserts a newline (Claude reads ESC-CR as a soft newline).
    xterm.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && e.key === 'Enter' && e.shiftKey) {
        // backslash line-continuation: Claude Code turns a trailing `\` + Enter
        // into a newline (works whether the line is empty or has text).
        window.api.ptyWrite(term.id, '\\\r')
        return false
      }
      if (e.type !== 'keydown' || !e.metaKey) return true
      if (e.key === 'c' && xterm.hasSelection()) {
        navigator.clipboard.writeText(xterm.getSelection())
        return false
      }
      if (e.key === 'v') {
        // A screenshot/image on the clipboard has no text/plain representation,
        // so xterm's own native paste (which only reads text) silently does
        // nothing with it — but Claude Code has its own native image paste
        // (reads the OS clipboard directly and shows a clean "[Image #1]"),
        // triggered by Ctrl+V rather than Cmd+V. Forward Cmd+V as Ctrl+V only
        // when there's actually an image, so plain Cmd+V text paste (handled
        // natively by xterm above) is untouched.
        window.api.hasClipboardImage().then((has) => {
          if (has) window.api.ptyWrite(term.id, '\x16')
        })
      }
      return true
    })

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

    // true once cleanup has run — guards the async snapshot/log replay below
    // from writing to an already-disposed xterm instance if the tab is
    // switched away (or the terminal closed) before that fetch resolves.
    let disposed = false
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
    // Watch typed input for a `claude` invocation so a manually-run claude
    // (not launched via the button) still gets its session captured and resumes
    // after a restart. Track a simple line buffer; bail on escape sequences
    // (arrow/nav keys) which would otherwise corrupt it.
    let inputLine = ''
    let claudeCaptureTimer: ReturnType<typeof setInterval> | undefined
    const markClaudeRun = (): void => {
      if (claudeMarkedRef.current) return
      claudeMarkedRef.current = true
      setIsClaudeTerm(true)
      window.api.markTerminalRanClaude(sessionId, term.id)
      if (term.cwd) captureManualClaude(term.cwd)
    }
    // Fallback for a `claude` we could not rewrite before it was sent (recalled
    // from shell history, say): watch for the transcript it creates. Claude
    // writes that file when the conversation gets its first message, which is
    // whenever the user gets round to typing — the old 30-second deadline
    // expired long before that on any terminal opened ahead of time. Main
    // declines to answer while a sibling terminal in the same folder is also
    // waiting, because a new file proves a claude started, never whose.
    const captureManualClaude = (cwd: string): void => {
      const since = Date.now()
      let tries = 0
      claudeCaptureTimer = setInterval(async () => {
        tries++
        const id = await window.api.claimClaudeSession(sessionId, term.id, cwd, since)
        if (id) {
          clearInterval(claudeCaptureTimer)
          setResumeId(id)
        } else if (tries > 200) {
          clearInterval(claudeCaptureTimer)
        }
      }, 3000)
    }
    xterm.onData((d) => {
      // Pin a hand-typed `claude` the moment Enter is pressed: the line is
      // still sitting in the shell's editor, so appending `--session-id <uuid>`
      // ahead of the newline binds this terminal to its own conversation,
      // exactly as the launch path does. Watching the transcripts folder after
      // the fact cannot do that — a new file proves a claude started, never
      // which terminal started it, so in a folder running several at once the
      // first watcher to tick would take a stranger's conversation.
      if (!claudeMarkedRef.current && !d.includes('\x1b')) {
        const brk = d.search(/[\r\n]/)
        const line = brk < 0 ? '' : (inputLine + d.slice(0, brk)).trim()
        if (line && CLAUDE_LINE_RE.test(line) && !CLAUDE_BOUND_RE.test(line)) {
          const id = window.api.newSessionId()
          window.api.ptyWrite(term.id, `${d.slice(0, brk)} --session-id ${id}${d.slice(brk)}`)
          inputLine = ''
          claudeMarkedRef.current = true
          setIsClaudeTerm(true)
          setResumeId(id)
          window.api.setTerminalClaude(sessionId, term.id, id)
          return
        }
      }
      window.api.ptyWrite(term.id, d)
      if (claudeMarkedRef.current) return
      if (d.includes('\x1b')) {
        inputLine = ''
        return
      }
      for (const ch of d) {
        if (ch === '\r' || ch === '\n') {
          if (CLAUDE_LINE_RE.test(inputLine.trim())) markClaudeRun()
          inputLine = ''
        } else if (ch === '\x7f' || ch === '\b') {
          inputLine = inputLine.slice(0, -1)
        } else if (ch >= ' ') {
          inputLine += ch
        }
      }
    })
    // fit reliably even when the container size settles a frame or two after
    // mount (fixes the "half-rendered terminal on resume" until you resize)
    const refit = (): void => {
      try {
        fit.fit()
        window.api.ptyResize(term.id, ptyCols(xterm.cols), xterm.rows)
        lastKnownSize = { cols: ptyCols(xterm.cols), rows: xterm.rows }
      } catch {
        /* ignore */
      }
    }
    requestAnimationFrame(refit)
    const refitTimers = [setTimeout(refit, 60), setTimeout(refit, 200)]

    ;(async () => {
      const snap = await window.api.terminalSnapshot(term.id)
      if (disposed) return
      if (snap) {
        // live terminal: replay accumulated buffer, then continue live.
        // write() queues large buffers internally and drains them over several
        // frames — fitting before that drain finishes corrupts xterm's
        // scrollback bookkeeping (the viewport ends up unable to scroll past
        // whatever's on screen), so wait for its completion callback instead
        // of racing a bare requestAnimationFrame against it.
        if (snap.buffer) xterm.write(snap.buffer, () => requestAnimationFrame(refit))
        else requestAnimationFrame(refit)
        snapSeq = snap.seq
      } else {
        // dead terminal — treat as a resumable Claude session ONLY if THIS
        // terminal actually ran claude (captured session id, or its command was
        // `claude`). Do NOT guess from the cwd: a plain shell terminal in a dir
        // where claude was used before is not a claude terminal.
        const claudeId = term.claudeSessionId || null
        const claudeish =
          !!claudeId || !!term.ranClaude || (term.command || '').trim().startsWith('claude')
        if (claudeish) {
          setResumeId(claudeId)
          setIsClaudeTerm(true)
        } else {
          const log = await window.api.readTerminalLog(sessionId, term.id)
          if (disposed) return
          if (log) xterm.write(log, () => requestAnimationFrame(refit))
        }
        setDead(true)
      }
      wrote = true
      for (const p of pending) if (p.seq > snapSeq) xterm.write(p.data)
      pending.length = 0
    })()

    // Keep the local xterm.js display fitted on every tick (cheap, just CSS/
    // canvas re-layout), but debounce the actual ptyResize call: that one
    // triggers a SIGWINCH the child process (e.g. Claude's Ink-based TUI)
    // must fully repaint for. A live window drag fires many ResizeObserver
    // ticks per second — sending each one straight through gives the TUI no
    // chance to finish a clean repaint before the next resize lands, leaving
    // stale wider-frame content stuck in some rows. Only notify the pty once
    // the size has settled.
    let resizeSettleTimer: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* ignore */
      }
      clearTimeout(resizeSettleTimer)
      resizeSettleTimer = setTimeout(() => {
        try {
          window.api.ptyResize(term.id, ptyCols(xterm.cols), xterm.rows)
          lastKnownSize = { cols: ptyCols(xterm.cols), rows: xterm.rows }
        } catch {
          /* ignore */
        }
      }, 120)
    })
    ro.observe(hostRef.current!)

    // dragging the window to a display with a different scale factor (e.g.
    // Retina laptop screen -> a 1x external monitor) doesn't change the host's
    // CSS pixel size, so ResizeObserver never fires — but the measured cell
    // width does change, leaving cols stale and the right edge cut off until
    // something else forces a refit. Watch devicePixelRatio directly.
    let dprMql: MediaQueryList
    const watchDpr = (): void => {
      dprMql = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      dprMql.addEventListener('change', onDprChange)
    }
    function onDprChange(): void {
      dprMql.removeEventListener('change', onDprChange)
      refit()
      watchDpr()
    }
    watchDpr()

    return () => {
      disposed = true
      offData()
      offExit()
      clearInterval(claudeCaptureTimer)
      ro.disconnect()
      clearTimeout(resizeSettleTimer)
      dprMql.removeEventListener('change', onDprChange)
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
          window.api.ptyResize(term.id, ptyCols(xtermRef.current!.cols), xtermRef.current!.rows)
          lastKnownSize = { cols: ptyCols(xtermRef.current!.cols), rows: xtermRef.current!.rows }
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
    const claudeish = isClaudeTerm || raw.startsWith('claude')
    // an id-less claude terminal adopts an unclaimed conversation in its own
    // folder rather than racing every sibling terminal for `--continue`'s
    // single "most recent" answer
    const bound = claudeish ? await window.api.resolveResumeId(sessionId, term.id) : null
    if (bound) {
      // an id whose claude never got as far as a first message has no
      // transcript yet; `--resume` on it exits with "No conversation found",
      // so the terminal starts UNDER the id it already owns instead
      cmd = bound.exists
        ? `claude --resume ${bound.id}`
        : `claude --session-id ${bound.id}`
      setResumeId(bound.id)
    } else if (claudeish) {
      cmd = 'claude --continue'
    } else if (raw) {
      cmd = raw
    }
    // claude gets a clean screen for its TUI; a plain shell keeps its scrollback
    // (the recorded history stays visible, the fresh prompt appends below).
    // Wrapped defensively: this is just display cleanup — if it throws, the
    // actual respawn below must still happen, or Resume looks like a dead
    // button (nothing to show for the click) with no process behind it.
    try {
      if (cmd) xtermRef.current?.reset()
      else xtermRef.current?.write('\r\n')
    } catch {
      /* ignore */
    }
    window.api.ptyCreate(term.id, {
      cwd: term.cwd,
      command: cmd || undefined,
      silent: !!cmd, // run the resume command without echoing it
      recordPath: logPath,
      // xterm is already mounted and fitted to the real container here — use
      // its actual size instead of falling back to the spawn default, which
      // (being a generic guess) can be far wider than the real terminal and
      // make Claude's first frame wrap chaotically until the next resize lands.
      cols: xtermRef.current ? ptyCols(xtermRef.current.cols) : undefined,
      rows: xtermRef.current?.rows
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
    <div
      className={`xterm-wrap ${visible ? '' : 'hidden'}`}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        const paths = Array.from(e.dataTransfer.files)
          .map((f) => window.api.getFilePath(f))
          .filter(Boolean)
        if (paths.length) window.api.ptyWrite(term.id, paths.map((p) => `'${p}' `).join(''))
      }}
    >
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
  const [tabRect, setTabRect] = useState<DOMRect | null>(null)
  const [sessQuery, setSessQuery] = useState('')
  const [splitId, setSplitId] = useState<string | null>(null) // second pane for split view
  const [tagInput, setTagInput] = useState('')
  const [termTagInput, setTermTagInput] = useState('')
  const [dragTab, setDragTab] = useState<string | null>(null) // tab being dragged
  const [dropTab, setDropTab] = useState<string | null>(null) // tab it would land on

  // ---- terminal tabs: drag to reorder ----
  function moveTerminal(fromId: string, toId: string): void {
    if (!open || fromId === toId) return
    const list = [...open.terminals]
    const from = list.findIndex((t) => t.id === fromId)
    const to = list.findIndex((t) => t.id === toId)
    if (from < 0 || to < 0) return
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    setOpen({ ...open, terminals: list })
    window.api.reorderTerminals(
      open.id,
      list.map((t) => t.id)
    )
  }

  // ---- terminal tags ----
  async function saveTermTags(terminalId: string, tags: string[]): Promise<void> {
    if (!open) return
    setOpen({
      ...open,
      terminals: open.terminals.map((x) =>
        x.id === terminalId ? { ...x, tags: tags.length ? tags : undefined } : x
      )
    })
    await window.api.setTerminalTags(open.id, terminalId, tags)
  }
  function addTermTag(terminalId: string): void {
    const v = termTagInput.trim().replace(/^#/, '')
    setTermTagInput('')
    if (!v || !open) return
    const tags = open.terminals.find((x) => x.id === terminalId)?.tags || []
    if (!tags.includes(v)) saveTermTags(terminalId, [...tags, v])
  }

  async function saveTags(tags: string[]): Promise<void> {
    if (!open) return
    setOpen({ ...open, tags })
    await window.api.updateSessionMeta(open.id, { tags })
    reload()
  }
  // ---- ticket binding (per terminal) ----
  // Status is fetched live rather than stored: a stale "In Progress" on a ticket
  // someone already moved is worse than showing nothing.
  const [tickets, setTickets] = useState<Record<string, JiraItem>>({})

  useEffect(() => {
    setTickets({})
    for (const trm of open?.terminals || []) {
      if (!trm.jiraKey) continue
      const key = trm.jiraKey
      window.api.jiraIssue(key).then((r) => {
        if (r.issue) setTickets((m) => ({ ...m, [key]: r.issue as JiraItem }))
      })
    }
  }, [open?.id, (open?.terminals || []).map((x) => x.jiraKey).join(',')])

  async function saveTerminalTicket(terminalId: string, raw: string): Promise<void> {
    if (!open) return
    const key = raw.trim().toUpperCase()
    if (key && !/^[A-Z][A-Z0-9]*-\d+$/.test(key)) {
      toast(t('sessBadKey'), 'error')
      return
    }
    setOpen({
      ...open,
      terminals: open.terminals.map((x) =>
        x.id === terminalId ? { ...x, jiraKey: key || undefined } : x
      )
    })
    await window.api.setTerminalJira(open.id, terminalId, key)
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

  async function setSessBg(id: string, bg: string): Promise<void> {
    setSessions((list) => list.map((x) => (x.id === id ? { ...x, bg: bg || undefined } : x)))
    await window.api.updateSessionMeta(id, { bg })
  }

  function reload(): void {
    window.api.listTermSessions(assistant.id).then(setSessions)
  }
  useEffect(reload, [assistant.id])

  // report the currently-focused terminal up (App suppresses its notification)
  useEffect(() => {
    if (open && active) rememberTerm(open.id, active)
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
    // an explicit target (notification / dashboard) wins; otherwise return to
    // whichever terminal you were last on in this session, not always the first
    const wanted = focusTermId && full.terminals.some((t) => t.id === focusTermId) ? focusTermId : null
    const remembered = lastTermMap()[full.id]
    const restored = full.terminals.some((t) => t.id === remembered) ? remembered : null
    setActive(wanted ?? restored ?? full.terminals[0]?.id ?? null)
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
      recordPath: logPath,
      cols: lastKnownSize?.cols,
      rows: lastKnownSize?.rows
    })
    started.add(terminal.id)
    setLogPaths((p) => ({ ...p, [terminal.id]: logPath }))
    setOpen((o) => (o ? { ...o, terminals: [...o.terminals, terminal] } : o))
    setActive(terminal.id)
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
        recordPath: logPath,
        cols: lastKnownSize?.cols,
        rows: lastKnownSize?.rows
      })
      started.add(terminal.id)
      setLogPaths((p) => ({ ...p, [terminal.id]: logPath }))
      setOpen((o) => (o ? { ...o, terminals: [...o.terminals, terminal] } : o))
      setActive(terminal.id)
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
    if (getPrefs().confirmDelete && !confirm(t('confirmDeleteSession'))) return
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
        <div className="search ss-search">
          <span className="search-ic">
            <Icon name="search" size={14} />
          </span>
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
                  className={`ss-item ${open?.id === s.id ? 'active' : ''} ${s.bg ? 'tinted' : ''}`}
                  style={s.bg ? { background: s.bg } : undefined}
                  onClick={() => (open?.id === s.id ? setOpen(null) : enter(s))}
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
                  {(() => {
                    const keys = [...new Set(s.terminals.map((x) => x.jiraKey).filter(Boolean))]
                    return keys.length ? (
                      <div className="ss-item-key">◫ {keys.join(' · ')}</div>
                    ) : null
                  })()}
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
                <>
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
                  <div className="tab-colors inline" onMouseDown={(e) => e.preventDefault()}>
                    {TAB_BGS.map((c) => (
                      <button
                        key={c || 'default'}
                        className={`tab-color ${(open.bg || '') === c ? 'sel' : ''}`}
                        style={{ background: c || 'var(--bg, #0a0a0c)' }}
                        title={c || 'default'}
                        onClick={() => {
                          setSessBg(open.id, c)
                          setOpen({ ...open, bg: c || undefined })
                        }}
                      />
                    ))}
                  </div>
                </>
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
                  className={`term-tab ${active === t.id ? 'active' : ''} ${t.bg ? 'tinted' : ''} ${
                    dragTab === t.id ? 'dragging' : ''
                  } ${dropTab === t.id && dragTab !== t.id ? 'dropzone' : ''}`}
                  style={t.bg ? { background: t.bg, color: '#f0f0f2' } : undefined}
                  // not while renaming — a draggable ancestor swallows the
                  // click-drag that selects text inside the rename input
                  draggable={editingTab !== t.id}
                  onDragStart={(e) => {
                    setDragTab(t.id)
                    e.dataTransfer.effectAllowed = 'move'
                    // custom type on purpose: the terminal body only accepts
                    // 'Files' drops, so a tab dragged over it is ignored
                    e.dataTransfer.setData('application/x-archo-tab', t.id)
                  }}
                  onDragOver={(e) => {
                    if (!dragTab) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDropTab(t.id)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragTab) moveTerminal(dragTab, t.id)
                    setDragTab(null)
                    setDropTab(null)
                  }}
                  onDragEnd={() => {
                    setDragTab(null)
                    setDropTab(null)
                  }}
                  onClick={() => setActive(t.id)}
                  onDoubleClick={(e) => {
                    setEditingTab(t.id)
                    setTermTagInput('')
                    setTabRect(e.currentTarget.getBoundingClientRect())
                  }}
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
                        // moving focus into the popover (e.g. the tag input) is
                        // still "editing this tab" — only an outside click closes
                        if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.tab-pop')) {
                          setEditingTab(null)
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      }}
                    />
                  ) : (
                    <span className="term-tab-name">{t.name}</span>
                  )}
                  {t.jiraKey && <span className="term-tab-key">{t.jiraKey}</span>}
                  {t.tags && t.tags.length > 0 && (
                    <span className="term-tab-tags">
                      {t.tags.map((tag) => (
                        <span key={tag} className="si-tag mini">
                          #{tag}
                        </span>
                      ))}
                    </span>
                  )}
                  {editingTab === t.id && tabRect && (
                    <div
                      className="tab-pop"
                      onClick={(e) => e.stopPropagation()}
                      style={{ position: 'fixed', top: tabRect.bottom + 3, left: tabRect.left }}
                    >
                    <div className="tab-colors inline" onMouseDown={(e) => e.preventDefault()}>
                      {TAB_BGS.map((c) => (
                        <button
                          key={c || 'default'}
                          className={`tab-color ${(t.bg || '') === c ? 'sel' : ''}`}
                          style={{ background: c || 'var(--bg, #0a0a0c)' }}
                          title={c || 'default'}
                          onClick={(e) => {
                            e.stopPropagation()
                            window.api.setTerminalBg(open.id, t.id, c)
                            setOpen({
                              ...open,
                              terminals: open.terminals.map((x) =>
                                x.id === t.id ? { ...x, bg: c || undefined } : x
                              )
                            })
                          }}
                        />
                      ))}
                    </div>
                      <div className="tab-pop-ticket">
                        <input
                          className="si-tag-input key"
                          placeholder={tx('sessTicketPh')}
                          defaultValue={t.jiraKey || ''}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          }}
                          onBlur={(e) => {
                            saveTerminalTicket(t.id, e.target.value)
                            if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.tab-pop')) {
                              setEditingTab(null)
                            }
                          }}
                        />
                        {t.jiraKey && tickets[t.jiraKey] && (
                          <span
                            className={`si-key-status cat-${tickets[t.jiraKey].statusCategory}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => window.api.openExternal(tickets[t.jiraKey!].url)}
                            title={tickets[t.jiraKey].summary}
                          >
                            {tickets[t.jiraKey].status}
                          </span>
                        )}
                      </div>
                      <div className="si-tags tab-pop-tags">
                        {(t.tags || []).map((tag) => (
                          <span key={tag} className="si-tag">
                            #{tag}
                            <span
                              className="si-tag-x"
                              title={tx('removeTag')}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() =>
                                saveTermTags(t.id, (t.tags || []).filter((x) => x !== tag))
                              }
                            >
                              ×
                            </span>
                          </span>
                        ))}
                        <input
                          className="si-tag-input"
                          placeholder={tx('tagPlaceholder')}
                          value={termTagInput}
                          onChange={(e) => setTermTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ',') {
                              e.preventDefault()
                              addTermTag(t.id)
                            }
                          }}
                          onBlur={(e) => {
                            addTermTag(t.id)
                            if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.tab-pop')) {
                              setEditingTab(null)
                            }
                          }}
                        />
                      </div>
                    </div>
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
