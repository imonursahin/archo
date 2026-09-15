import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { safeReadDir } from './fsutil'
import { projectSlug } from './shellenv'

const HOME = os.homedir()
const CLAUDE_DIR = path.join(HOME, '.claude')

// ---------------- Sessions (Claude JSONL) ----------------

export interface SessionMeta {
  id: string
  path: string
  project: string // real cwd from the transcript (falls back to decoded slug)
  cwd: string // real working dir, validated for resume
  mtime: number
  sizeBytes: number
  messageCount: number
  firstMessage: string
  gitBranch?: string
  version?: string
}

function decodeProjectSlug(slug: string): string {
  return slug.replace(/^-/, '/').replace(/-/g, '/')
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b: any) => {
        if (typeof b === 'string') return b
        if (b?.type === 'text') return b.text
        if (b?.type === 'tool_use') return `🔧 ${b.name}`
        return ''
      })
      .filter(Boolean)
      .join(' ')
  }
  return ''
}

export async function listSessions(limit = 200): Promise<SessionMeta[]> {
  const projectsDir = path.join(CLAUDE_DIR, 'projects')
  const projects = await safeReadDir(projectsDir)
  const metas: SessionMeta[] = []
  for (const proj of projects) {
    const dir = path.join(projectsDir, proj)
    const files = (await safeReadDir(dir)).filter((f) => f.endsWith('.jsonl'))
    for (const f of files) {
      const full = path.join(dir, f)
      try {
        const stat = await fs.stat(full)
        const fallback = decodeProjectSlug(proj)
        metas.push({
          id: f.replace(/\.jsonl$/, ''),
          path: full,
          project: fallback,
          cwd: fallback,
          mtime: stat.mtimeMs,
          sizeBytes: stat.size,
          messageCount: 0,
          firstMessage: ''
        })
      } catch {
        /* ignore */
      }
    }
  }
  metas.sort((a, b) => b.mtime - a.mtime)
  const top = metas.slice(0, limit)
  await Promise.all(
    top.map(async (m) => {
      try {
        const text = await fs.readFile(m.path, 'utf8')
        const lines = text.split('\n').filter(Boolean)
        let count = 0
        let first = ''
        for (const line of lines) {
          let obj: any
          try {
            obj = JSON.parse(line)
          } catch {
            continue
          }
          if ((obj.type === 'user' || obj.type === 'assistant') && !obj.isMeta) count++
          if (!first && obj.type === 'user' && !obj.isMeta) {
            const t = contentToText(obj.message?.content).trim()
            if (t && !t.startsWith('<')) first = t.slice(0, 120)
          }
          // real cwd straight from the transcript — never guess from the slug
          if (obj.cwd && typeof obj.cwd === 'string') {
            m.cwd = obj.cwd
            m.project = obj.cwd
          }
          if (obj.gitBranch) m.gitBranch = obj.gitBranch
          if (obj.version) m.version = obj.version
        }
        m.messageCount = count
        m.firstMessage = first || '(başlıksız oturum)'
      } catch {
        /* ignore */
      }
    })
  )
  return top
}

export interface SessionMessage {
  role: 'user' | 'assistant'
  text: string
  toolCalls: { name: string; input?: unknown }[]
  timestamp?: string
}

// Find the claude session id most recently written for a given cwd,
// used to capture the transcript a freshly-launched `claude` created.
export async function detectClaudeSession(cwd: string, sinceMs: number): Promise<string | null> {
  const slug = projectSlug(cwd)
  const dir = path.join(CLAUDE_DIR, 'projects', slug)
  const files = (await safeReadDir(dir)).filter((f) => f.endsWith('.jsonl'))
  let best: { id: string; mtime: number } | null = null
  for (const f of files) {
    try {
      const stat = await fs.stat(path.join(dir, f))
      if (stat.mtimeMs >= sinceMs - 3000 && (!best || stat.mtimeMs > best.mtime)) {
        best = { id: f.replace(/\.jsonl$/, ''), mtime: stat.mtimeMs }
      }
    } catch {
      /* ignore */
    }
  }
  return best?.id ?? null
}

// Does a conversation with this id exist anywhere? Deliberately NOT scoped to a
// folder: a terminal opened at the repo root may have `cd`-ed somewhere else
// before running claude, so its transcript lives under a different project slug
// than the one the terminal recorded.
export async function transcriptExists(id: string): Promise<boolean> {
  const projectsDir = path.join(CLAUDE_DIR, 'projects')
  for (const proj of await safeReadDir(projectsDir)) {
    try {
      await fs.stat(path.join(projectsDir, proj, `${id}.jsonl`))
      return true
    } catch {
      /* not in this project */
    }
  }
  return false
}

// Erase a conversation from Claude's own store. Same unscoped search as
// transcriptExists: the terminal's cwd is not necessarily where claude ran.
export async function deleteTranscript(
  id: string
): Promise<{ removed: number; failed: number }> {
  const out = { removed: 0, failed: 0 }
  if (!/^[\w-]+$/.test(id)) return out
  const projectsDir = path.join(CLAUDE_DIR, 'projects')
  for (const proj of await safeReadDir(projectsDir)) {
    const file = path.join(projectsDir, proj, `${id}.jsonl`)
    try {
      await fs.rm(file)
      out.removed++
    } catch (e) {
      // "it was not in this project" is the normal case; anything else means
      // the file is there and stayed there — a locked or read-only transcript
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') out.failed++
    }
  }
  return out
}

// All claude sessions for a cwd, newest first, touched at/after sinceMs.
// `btime` (file creation) is reported alongside `mtime` because the two answer
// different questions: mtime says "this conversation is alive", btime says
// "this conversation STARTED here". Binding a terminal to a transcript needs
// the second one — in a folder where several sessions run at once, every one of
// them keeps its mtime fresh.
export async function detectClaudeSessions(
  cwd: string,
  sinceMs: number
): Promise<{ id: string; mtime: number; btime: number }[]> {
  const slug = projectSlug(cwd)
  const dir = path.join(CLAUDE_DIR, 'projects', slug)
  const out: { id: string; mtime: number; btime: number }[] = []
  for (const f of await safeReadDir(dir)) {
    if (!f.endsWith('.jsonl')) continue
    try {
      const stat = await fs.stat(path.join(dir, f))
      if (stat.mtimeMs >= sinceMs - 3000) {
        out.push({
          id: f.replace(/\.jsonl$/, ''),
          mtime: stat.mtimeMs,
          btime: stat.birthtimeMs || stat.ctimeMs
        })
      }
    } catch {
      /* ignore */
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
}

export interface TranscriptHit {
  file: string
  sessionId: string
  project: string // decoded cwd
  role: 'user' | 'assistant'
  snippet: string
  timestamp?: string
  mtime: number
}

// Full-text search across every Claude transcript (all projects). Returns the
// matching messages with a snippet, most-recent first.
export async function searchTranscripts(
  query: string,
  scope?: string[],
  limit = 80
): Promise<TranscriptHit[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const roots = (scope || []).map((c) => c.replace(/\/$/, '')).filter(Boolean)
  const inScope = (cwd: string): boolean =>
    roots.length === 0 || roots.some((r) => cwd === r || cwd.startsWith(r + '/'))
  const projectsDir = path.join(CLAUDE_DIR, 'projects')
  const projects = await safeReadDir(projectsDir)
  const hits: TranscriptHit[] = []
  for (const proj of projects) {
    const dir = path.join(projectsDir, proj)
    const files = (await safeReadDir(dir)).filter((f) => f.endsWith('.jsonl'))
    for (const f of files) {
      const full = path.join(dir, f)
      let content: string
      let mtime = 0
      try {
        mtime = (await fs.stat(full)).mtimeMs
        content = await fs.readFile(full, 'utf8')
      } catch {
        continue
      }
      const lines = content.split('\n')
      // the transcript's REAL cwd (from its first entry) — used for scope
      // filtering and, crucially, for `claude --resume` to find the session
      // (the decoded slug mangles dir names that contain hyphens).
      let fileCwd = ''
      for (const line of lines) {
        if (!line.trim() || !line.includes('"cwd"')) continue
        try {
          const c = JSON.parse(line).cwd
          if (c) {
            fileCwd = c
            break
          }
        } catch {
          continue
        }
      }
      if (roots.length && !inScope(fileCwd)) continue
      const projectCwd = fileCwd || decodeProjectSlug(proj)
      for (const line of lines) {
        // cheap pre-filter before the JSON parse
        if (!line || !line.toLowerCase().includes(q)) continue
        let obj: any
        try {
          obj = JSON.parse(line)
        } catch {
          continue
        }
        if ((obj.type !== 'user' && obj.type !== 'assistant') || obj.isMeta) continue
        const text = contentToText(obj.message?.content).trim()
        if (!text || text.startsWith('<local-command') || text.startsWith('<command-')) continue
        const at = text.toLowerCase().indexOf(q)
        if (at < 0) continue
        const start = Math.max(0, at - 60)
        const snippet =
          (start > 0 ? '…' : '') +
          text.slice(start, at + q.length + 140).replace(/\s+/g, ' ') +
          (text.length > at + q.length + 140 ? '…' : '')
        hits.push({
          file: full,
          sessionId: f.replace(/\.jsonl$/, ''),
          project: projectCwd,
          role: obj.type,
          snippet,
          timestamp: obj.timestamp,
          mtime
        })
        if (hits.length >= limit) {
          hits.sort((a, b) => b.mtime - a.mtime)
          return hits
        }
      }
    }
  }
  hits.sort((a, b) => b.mtime - a.mtime)
  return hits
}

export async function readSession(file: string): Promise<SessionMessage[]> {
  const text = await fs.readFile(file, 'utf8')
  const out: SessionMessage[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let obj: any
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    if ((obj.type !== 'user' && obj.type !== 'assistant') || obj.isMeta) continue
    const content = obj.message?.content
    const toolCalls: { name: string; input?: unknown }[] = []
    if (Array.isArray(content)) {
      for (const b of content) {
        if (b?.type === 'tool_use') toolCalls.push({ name: b.name, input: b.input })
      }
    }
    const t = contentToText(content).trim()
    if (!t && toolCalls.length === 0) continue
    if (t.startsWith('<local-command') || t.startsWith('<command-')) continue
    out.push({ role: obj.type, text: t, toolCalls, timestamp: obj.timestamp })
  }
  return out
}
