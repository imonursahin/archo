import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { safeReadDir } from './fsutil'

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
  const slug = cwd.replace(/[/.]/g, '-')
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

// All claude sessions for a cwd, newest first, created at/after sinceMs.
export async function detectClaudeSessions(
  cwd: string,
  sinceMs: number
): Promise<{ id: string; mtime: number }[]> {
  const slug = cwd.replace(/[/.]/g, '-')
  const dir = path.join(CLAUDE_DIR, 'projects', slug)
  const out: { id: string; mtime: number }[] = []
  for (const f of await safeReadDir(dir)) {
    if (!f.endsWith('.jsonl')) continue
    try {
      const stat = await fs.stat(path.join(dir, f))
      if (stat.mtimeMs >= sinceMs - 3000) {
        out.push({ id: f.replace(/\.jsonl$/, ''), mtime: stat.mtimeMs })
      }
    } catch {
      /* ignore */
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime)
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
