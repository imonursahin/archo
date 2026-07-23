import * as pty from 'node-pty'
import os from 'os'
import { createWriteStream, existsSync, statSync, mkdirSync, WriteStream } from 'fs'
import path from 'path'
import { BrowserWindow } from 'electron'

function safeCwd(cwd?: string): string {
  try {
    if (cwd && existsSync(cwd) && statSync(cwd).isDirectory()) return cwd
  } catch {
    /* ignore */
  }
  return os.homedir()
}

interface Term {
  proc: pty.IPty
  id: string
  rec?: WriteStream
  buffer: string // accumulated output for reattach snapshots
  seq: number // number of data events emitted so far
  lastData: number // last output timestamp
  burstStart: number // when the current output burst started
  burstBytes: number // bytes produced in the current burst
  running: boolean // an output burst is in progress
  busySent: boolean // spinner (busy:true) already emitted for this burst
  notified: boolean // done-notification already fired for this burst
}

// A burst must produce at least this many bytes to count as "real work"
// (Claude streaming / a running command) rather than keystroke echo or a
// prompt redraw. This keeps the spinner/notification off while you just type.
const BUSY_BYTES = 1500

const MAX_BUFFER = 500_000 // cap in-memory scrollback per terminal

const terms = new Map<string, Term>()

// ---- busy/idle detection (main-side, so it works for ALL terminals even when
// their view is unmounted / you're in another session) ----
let mainWin: BrowserWindow | null = null
let idleTimer: ReturnType<typeof setInterval> | null = null

function stripAnsi(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '') // CSI
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '') // OSC
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[@-Z\\-_]/g, '') // other escapes
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x09\x0b-\x1f]/g, '') // control chars (keep \n)
}

function lastLine(buffer: string): string {
  const clean = stripAnsi(buffer.slice(-6000))
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean)
  return (lines[lines.length - 1] || '').slice(0, 120)
}

function send(channel: string, payload: unknown): void {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send(channel, payload)
}

function ensureIdleWatch(): void {
  if (idleTimer) return
  idleTimer = setInterval(() => {
    const now = Date.now()
    for (const t of terms.values()) {
      if (!t.running) continue
      if (now - t.lastData > 2500) {
        // burst ended
        t.running = false
        const wasWork = t.busySent // only real (heavy-output) bursts matter
        if (t.busySent) send('pty:busy', { id: t.id, busy: false })
        if (wasWork && !t.notified) {
          t.notified = true
          send('pty:done', {
            id: t.id,
            lastLine: lastLine(t.buffer),
            durationSec: (t.lastData - t.burstStart) / 1000
          })
        }
      }
    }
  }, 1000)
}

const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : 'zsh')

// If Agent Studio was itself launched from inside a Claude Code session, these
// markers leak into spawned terminals and make a nested `claude` misbehave
// (no transcript persistence, exits early). Strip them for a clean top-level run.
function cleanEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>
  for (const k of Object.keys(env)) {
    if (k === 'CLAUDECODE' || k.startsWith('CLAUDE_CODE_') || k === 'CLAUDE_EFFORT') {
      delete env[k]
    }
  }
  env.TERM = 'xterm-256color'
  env.TERM_PROGRAM = 'AgentStudio'
  env.TERM_SESSION_ID = ''
  // We spawn an interactive (not login) shell for speed, so login-only PATH
  // entries (e.g. Homebrew from .zprofile) may be missing when the app is
  // launched from Finder. Guarantee a sane PATH floor so brew/claude resolve.
  const home = process.env.HOME || ''
  const floor = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    home && `${home}/.local/bin`,
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ].filter(Boolean) as string[]
  const existing = (env.PATH || '').split(':').filter(Boolean)
  env.PATH = [...new Set([...existing, ...floor])].join(':')
  return env
}

export function createTerm(
  win: BrowserWindow,
  id: string,
  opts: {
    cwd?: string
    cols?: number
    rows?: number
    command?: string
    recordPath?: string
    silent?: boolean // run command as a shell arg (not echoed as typed input)
  }
): void {
  if (terms.has(id)) return
  // silent command: run it as a shell argument (not echoed as typed input),
  // then drop into an interactive shell so the terminal stays usable after
  // interactive (not login) shell: sources ~/.zshrc once instead of the full
  // login chain, which on heavy dotfiles is dramatically faster to start
  const args =
    opts.silent && opts.command ? ['-i', '-c', `${opts.command}; exec ${shell} -i`] : ['-i']
  const proc = pty.spawn(shell, args, {
    name: 'xterm-color',
    cols: opts.cols || 80,
    rows: opts.rows || 24,
    cwd: safeCwd(opts.cwd),
    env: cleanEnv()
  })

  // open a recording stream (append) if a path was provided
  let rec: WriteStream | undefined
  if (opts.recordPath) {
    try {
      mkdirSync(path.dirname(opts.recordPath), { recursive: true })
      rec = createWriteStream(opts.recordPath, { flags: 'a' })
    } catch {
      rec = undefined
    }
  }

  const term: Term = {
    proc,
    id,
    rec,
    buffer: '',
    seq: 0,
    lastData: 0,
    burstStart: 0,
    burstBytes: 0,
    running: false,
    busySent: false,
    notified: false
  }
  terms.set(id, term)
  mainWin = win
  ensureIdleWatch()

  proc.onData((data) => {
    term.seq++
    term.buffer += data
    if (term.buffer.length > MAX_BUFFER) term.buffer = term.buffer.slice(-MAX_BUFFER)
    // activity tracking → spinner (busy) only once a burst is clearly "work"
    // (heavy output), not keystroke echo / prompt redraw
    const now = Date.now()
    if (!term.running) {
      term.running = true
      term.burstStart = now
      term.burstBytes = 0
      term.busySent = false
      term.notified = false
    }
    term.burstBytes += data.length
    term.lastData = now
    if (!term.busySent && term.burstBytes > BUSY_BYTES) {
      term.busySent = true
      send('pty:busy', { id, busy: true })
    }
    if (!win.isDestroyed()) win.webContents.send('pty:data', { id, data, seq: term.seq })
    if (rec) {
      try {
        rec.write(JSON.stringify({ t: Date.now(), d: data }) + '\n')
      } catch {
        /* ignore */
      }
    }
  })
  proc.onExit(({ exitCode }) => {
    if (term.busySent) send('pty:busy', { id, busy: false })
    if (!win.isDestroyed()) win.webContents.send('pty:exit', { id, exitCode })
    rec?.end()
    terms.delete(id)
  })
  if (opts.command && !opts.silent) proc.write(opts.command + '\r')
}

export function writeTerm(id: string, data: string): void {
  terms.get(id)?.proc.write(data)
}

export function resizeTerm(id: string, cols: number, rows: number): void {
  try {
    terms.get(id)?.proc.resize(cols, rows)
  } catch {
    /* ignore */
  }
}

export function killTerm(id: string): void {
  const t = terms.get(id)
  if (t) {
    try {
      t.proc.kill()
    } catch {
      /* ignore */
    }
    t.rec?.end()
    terms.delete(id)
  }
}

export function isLive(id: string): boolean {
  return terms.has(id)
}

// current output buffer + seq, for reattaching a view without losing scrollback
export function snapshot(id: string): { buffer: string; seq: number } | null {
  const t = terms.get(id)
  return t ? { buffer: t.buffer, seq: t.seq } : null
}

export function killAll(): void {
  for (const id of terms.keys()) killTerm(id)
}
