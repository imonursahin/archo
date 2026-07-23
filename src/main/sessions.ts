import { promises as fs } from 'fs'
import path from 'path'

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

export async function addTerminal(
  sessionId: string,
  input: { name?: string; cwd?: string; command?: string }
): Promise<TerminalRec> {
  const list = await load()
  const s = list.find((x) => x.id === sessionId)
  if (!s) throw new Error('session yok')
  const t: TerminalRec = {
    id: `term-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: input.name || `Terminal ${s.terminals.length + 1}`,
    createdAt: Date.now(),
    cwd: input.cwd,
    command: input.command
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
