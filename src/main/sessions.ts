import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import path from 'path'
import { detectClaudeSessions } from './claude'

// User-created terminal sessions (cmux-style). A session is a named workspace
// that contains one or more child terminals. Every terminal's output is
// recorded to disk so its history survives restarts.

export interface TerminalRec {
  id: string
  name: string
  createdAt: number
  cwd?: string
  command?: string
  claudeSessionId?: string // captured claude session for seamless --resume
  ranClaude?: boolean // claude was run here (even typed manually) → resume on restart
  bg?: string // custom terminal background color
  tags?: string[]
  jiraKey?: string // the ticket this terminal's work belongs to
}

export interface TermSession {
  id: string
  name: string
  assistantId: string
  createdAt: number
  terminals: TerminalRec[]
  note?: string
  tags?: string[]
  pinned?: boolean
  bg?: string // custom session color
  cwd?: string // working directory for this session's terminals (target repo)
  checkpoints?: { sha: string; message: string; time: number }[]
  model?: string // preferred claude model for this session (opus/sonnet/haiku)
  effort?: string // preferred reasoning effort (low/medium/high)
}

let storePath = ''
let logsDir = ''

export function setPaths(store: string, logs: string): void {
  storePath = store
  logsDir = logs
}

async function load(): Promise<TermSession[]> {
  try {
    const j = JSON.parse(await fs.readFile(storePath, 'utf8'))
    return Array.isArray(j?.sessions) ? j.sessions : []
  } catch {
    return []
  }
}
async function persist(list: TermSession[]): Promise<void> {
  await fs.writeFile(storePath, JSON.stringify({ sessions: list }, null, 2), 'utf8')
}

export function logPathFor(sessionId: string, terminalId: string): string {
  return path.join(logsDir, sessionId, `${terminalId}.jsonl`)
}

export async function listSessions(assistantId: string): Promise<TermSession[]> {
  return (await load())
    .filter((s) => s.assistantId === assistantId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

// Which TERMINAL is doing which ticket's work — across ALL assistants, because
// the dashboard shows your whole sprint, not one assistant's slice of it. Bound
// per terminal rather than per session: one session routinely holds several
// terminals working on different tickets.
export async function listJiraBindings(): Promise<
  {
    sessionId: string
    assistantId: string
    sessionName: string
    terminalId: string
    terminalName: string
    jiraKey: string
  }[]
> {
  const out: Awaited<ReturnType<typeof listJiraBindings>> = []
  for (const s of await load()) {
    for (const t of s.terminals) {
      if (!t.jiraKey) continue
      out.push({
        sessionId: s.id,
        assistantId: s.assistantId,
        sessionName: s.name,
        terminalId: t.id,
        terminalName: t.name,
        jiraKey: t.jiraKey
      })
    }
  }
  return out
}

export async function getSession(id: string): Promise<TermSession | null> {
  return (await load()).find((s) => s.id === id) || null
}

export async function createSession(assistantId: string, name: string): Promise<TermSession> {
  const list = await load()
  let finalName = name.trim()
  if (!finalName) {
    // auto-name: Session N, where N avoids collisions for this assistant
    const count = list.filter((s) => s.assistantId === assistantId).length
    let n = count + 1
    const names = new Set(list.filter((s) => s.assistantId === assistantId).map((s) => s.name))
    while (names.has(`Session ${n}`)) n++
    finalName = `Session ${n}`
  }
  const s: TermSession = {
    id: `sess-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: finalName,
    assistantId,
    createdAt: Date.now(),
    terminals: []
  }
  await persist([...list, s])
  return s
}

export async function renameSession(id: string, name: string): Promise<void> {
  const list = await load()
  await persist(list.map((s) => (s.id === id ? { ...s, name: name.trim() || s.name } : s)))
}

export async function updateSessionMeta(
  id: string,
  patch: {
    note?: string
    tags?: string[]
    pinned?: boolean
    bg?: string
    cwd?: string
    model?: string
    effort?: string
  }
): Promise<void> {
  const list = await load()
  await persist(
    list.map((s) =>
      s.id === id
        ? {
            ...s,
            ...(patch.note !== undefined ? { note: patch.note } : {}),
            ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
            ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
            ...(patch.bg !== undefined ? { bg: patch.bg || undefined } : {}),
            ...(patch.cwd !== undefined ? { cwd: patch.cwd } : {}),
            ...(patch.model !== undefined ? { model: patch.model } : {}),
            ...(patch.effort !== undefined ? { effort: patch.effort } : {})
          }
        : s
    )
  )
}

export async function addSessionCheckpoint(
  id: string,
  cp: { sha: string; message: string; time: number }
): Promise<void> {
  const list = await load()
  await persist(
    list.map((s) =>
      s.id === id ? { ...s, checkpoints: [cp, ...(s.checkpoints || [])].slice(0, 25) } : s
    )
  )
}

export async function removeSessionCheckpoint(id: string, sha: string): Promise<void> {
  const list = await load()
  await persist(
    list.map((s) =>
      s.id === id ? { ...s, checkpoints: (s.checkpoints || []).filter((c) => c.sha !== sha) } : s
    )
  )
}

// locate which session/assistant a terminal belongs to (for notifications)
export async function findTerminal(termId: string): Promise<{
  assistantId: string
  sessionId: string
  sessionName: string
  terminalName: string
} | null> {
  const list = await load()
  for (const s of list) {
    const t = s.terminals.find((x) => x.id === termId)
    if (t)
      return {
        assistantId: s.assistantId,
        sessionId: s.id,
        sessionName: s.name,
        terminalName: t.name
      }
  }
  return null
}

export async function deleteSession(id: string): Promise<void> {
  const list = await load()
  await persist(list.filter((s) => s.id !== id))
  await fs.rm(path.join(logsDir, id), { recursive: true, force: true }).catch(() => {})
}

// Remove ALL of an assistant's sessions + their recorded logs, leaving nothing
// behind. Returns the terminal ids so the caller can kill their live PTYs.
export async function deleteSessionsForAssistant(assistantId: string): Promise<string[]> {
  const list = await load()
  const mine = list.filter((s) => s.assistantId === assistantId)
  if (mine.length === 0) return []
  const termIds: string[] = []
  for (const s of mine) {
    for (const t of s.terminals) termIds.push(t.id)
    await fs.rm(path.join(logsDir, s.id), { recursive: true, force: true }).catch(() => {})
  }
  await persist(list.filter((s) => s.assistantId !== assistantId))
  return termIds
}

// `claude` invocations that pick their own conversation — nothing to pin.
const CLAUDE_BOUND_RE = /(^|\s)(--session-id|--resume|-r|--continue|-c)(\s|=|$)/
const CLAUDE_CMD_RE = /^claude(\s|$)/
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

// Decide, at launch time, WHICH conversation a claude terminal owns.
// We pin it with `--session-id <uuid>` instead of watching the transcripts
// folder afterwards to find out: that watch was a race against every other
// claude running in the same directory, and a terminal that lost it had no id
// to resume — so a restart fell back to `claude --continue`, which hands the
// single most recently touched conversation to every terminal that asks. That
// is what made restarts bleed sessions into each other.
function pinClaudeSession(command?: string): { command?: string; claudeSessionId?: string } {
  const cmd = (command || '').trim()
  if (!cmd || !CLAUDE_CMD_RE.test(cmd)) return { command }
  if (!CLAUDE_BOUND_RE.test(cmd)) {
    const id = randomUUID()
    return { command: `${cmd} --session-id ${id}`, claudeSessionId: id }
  }
  // already bound to a specific conversation (e.g. the Resume button's
  // `claude --resume <id>`) — adopt that id rather than minting a new one
  const explicit = /--(?:session-id|resume|r)[= ]([0-9a-f-]+)/i.exec(cmd)?.[1]
  return { command, claudeSessionId: explicit && UUID_RE.test(explicit) ? explicit : undefined }
}

export async function addTerminal(
  sessionId: string,
  input: { name?: string; cwd?: string; command?: string }
): Promise<TerminalRec> {
  const list = await load()
  const s = list.find((x) => x.id === sessionId)
  if (!s) throw new Error('session yok')
  const pinned = pinClaudeSession(input.command)
  const t: TerminalRec = {
    id: `term-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: input.name || `Terminal ${s.terminals.length + 1}`,
    createdAt: Date.now(),
    cwd: input.cwd,
    command: pinned.command,
    ...(pinned.claudeSessionId
      ? { claudeSessionId: pinned.claudeSessionId, ranClaude: true }
      : {})
  }
  s.terminals.push(t)
  await persist(list)
  await fs.mkdir(path.join(logsDir, sessionId), { recursive: true }).catch(() => {})
  return t
}

export async function renameTerminal(
  sessionId: string,
  terminalId: string,
  name: string
): Promise<void> {
  const list = await load()
  const s = list.find((x) => x.id === sessionId)
  if (!s) return
  s.terminals = s.terminals.map((t) => (t.id === terminalId ? { ...t, name } : t))
  await persist(list)
}

export async function setTerminalClaude(
  sessionId: string,
  terminalId: string,
  claudeSessionId: string
): Promise<void> {
  const list = await load()
  const s = list.find((x) => x.id === sessionId)
  if (!s) return
  s.terminals = s.terminals.map((t) =>
    t.id === terminalId ? { ...t, claudeSessionId, ranClaude: true } : t
  )
  await persist(list)
}

// Mark that claude was run in this terminal even before its session id is known
// (e.g. the user typed `claude` manually). Ensures it resumes on restart instead
// of being restarted as a plain shell.
export async function setTerminalBg(
  sessionId: string,
  terminalId: string,
  bg: string
): Promise<void> {
  const list = await load()
  const s = list.find((x) => x.id === sessionId)
  if (!s) return
  s.terminals = s.terminals.map((t) =>
    t.id === terminalId ? { ...t, bg: bg || undefined } : t
  )
  await persist(list)
}

export async function setTerminalTags(
  sessionId: string,
  terminalId: string,
  tags: string[]
): Promise<void> {
  const list = await load()
  const s = list.find((x) => x.id === sessionId)
  if (!s) return
  s.terminals = s.terminals.map((t) =>
    t.id === terminalId ? { ...t, tags: tags.length ? tags : undefined } : t
  )
  await persist(list)
}

// Apply a drag-and-drop tab order. Rebuilt from the stored terminals rather
// than trusting the incoming list wholesale: a terminal the renderer didn't
// know about (added from another view while the drag was in flight) or a
// duplicated id must never drop a terminal from the session.
export async function setTerminalJira(
  sessionId: string,
  terminalId: string,
  jiraKey: string
): Promise<void> {
  const list = await load()
  const s = list.find((x) => x.id === sessionId)
  if (!s) return
  s.terminals = s.terminals.map((t) =>
    t.id === terminalId ? { ...t, jiraKey: jiraKey || undefined } : t
  )
  await persist(list)
}

export async function reorderTerminals(sessionId: string, orderedIds: string[]): Promise<void> {
  const list = await load()
  const s = list.find((x) => x.id === sessionId)
  if (!s) return
  const seen = new Set<string>()
  const next: TerminalRec[] = []
  for (const id of orderedIds) {
    if (seen.has(id)) continue
    const t = s.terminals.find((x) => x.id === id)
    if (t) {
      seen.add(id)
      next.push(t)
    }
  }
  for (const t of s.terminals) if (!seen.has(t.id)) next.push(t)
  s.terminals = next
  await persist(list)
}

export async function markTerminalRanClaude(
  sessionId: string,
  terminalId: string
): Promise<void> {
  const list = await load()
  const s = list.find((x) => x.id === sessionId)
  if (!s) return
  let changed = false
  s.terminals = s.terminals.map((t) => {
    if (t.id === terminalId && !t.ranClaude) {
      changed = true
      return { ...t, ranClaude: true }
    }
    return t
  })
  if (changed) await persist(list)
}

// Every claude conversation already owned by a terminal. The claim list is the
// store itself, not per-window state: two terminals in different sessions must
// never resume the same conversation either.
async function claimedClaudeIds(exceptTerminalId?: string): Promise<Set<string>> {
  const out = new Set<string>()
  for (const s of await load())
    for (const t of s.terminals)
      if (t.claudeSessionId && t.id !== exceptTerminalId) out.add(t.claudeSessionId)
  return out
}

// Bind the transcript a hand-typed `claude` just created to this terminal.
// Only transcripts BORN after the user typed it count — the sibling sessions
// running in the same folder keep their mtime fresh every second, so matching
// on mtime let one terminal claim another terminal's conversation.
export async function claimClaudeSession(
  sessionId: string,
  terminalId: string,
  cwd: string,
  sinceMs: number
): Promise<string | null> {
  const claimed = await claimedClaudeIds(terminalId)
  const id = (await detectClaudeSessions(cwd, sinceMs))
    .filter((c) => c.btime >= sinceMs - 3000 && !claimed.has(c.id))
    .sort((a, b) => a.btime - b.btime)[0]?.id
  if (!id) return null
  await setTerminalClaude(sessionId, terminalId, id)
  return id
}

// Which conversation a claude terminal resumes after a restart. Terminals
// created before session pinning (or whose claude was typed by hand and never
// captured) have no id — they adopt the newest transcript in their own folder
// that no other terminal has claimed, and keep it. `claude --continue` is the
// last resort only: it resolves to the same conversation for every terminal
// sharing a directory.
export async function resolveResumeId(
  sessionId: string,
  terminalId: string
): Promise<string | null> {
  const t = (await load())
    .find((x) => x.id === sessionId)
    ?.terminals.find((x) => x.id === terminalId)
  if (!t) return null
  if (t.claudeSessionId) return t.claudeSessionId
  if (!t.cwd) return null
  const claimed = await claimedClaudeIds(terminalId)
  const id = (await detectClaudeSessions(t.cwd, 0)).find((c) => !claimed.has(c.id))?.id
  if (!id) return null
  await setTerminalClaude(sessionId, terminalId, id)
  return id
}

export async function removeTerminal(sessionId: string, terminalId: string): Promise<void> {
  const list = await load()
  const s = list.find((x) => x.id === sessionId)
  if (!s) return
  s.terminals = s.terminals.filter((t) => t.id !== terminalId)
  await persist(list)
  await fs.rm(logPathFor(sessionId, terminalId), { force: true }).catch(() => {})
}

// Read a terminal's recorded output as one concatenated string (for replay).
export async function readTerminalLog(sessionId: string, terminalId: string): Promise<string> {
  try {
    const text = await fs.readFile(logPathFor(sessionId, terminalId), 'utf8')
    let out = ''
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        out += JSON.parse(line).d
      } catch {
        /* ignore */
      }
    }
    return out
  } catch {
    return ''
  }
}
