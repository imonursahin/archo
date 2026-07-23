import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { safeReadDir } from './fsutil'

const HOME = os.homedir()
const CLAUDE_DIR = path.join(HOME, '.claude')

// USD per 1M tokens. cache-write 5m = input*1.25, 1h = input*2, read = input*0.1.
interface Price {
  in: number
  out: number
}
const PRICING: Record<string, Price> = {
  'claude-fable-5': { in: 10, out: 50 },
  'claude-mythos-5': { in: 10, out: 50 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-opus-4-6': { in: 5, out: 25 },
  'claude-opus-4-5': { in: 5, out: 25 },
  'claude-opus-4-1': { in: 15, out: 75 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-sonnet-4-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 }
}

function priceFor(model: string): Price {
  if (PRICING[model]) return PRICING[model]
  // best-effort family match
  if (model.includes('opus')) return { in: 5, out: 25 }
  if (model.includes('sonnet')) return { in: 3, out: 15 }
  if (model.includes('haiku')) return { in: 1, out: 5 }
  if (model.includes('fable') || model.includes('mythos')) return { in: 10, out: 50 }
  return { in: 5, out: 25 }
}

interface Bucket {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
  messages: number
}
function emptyBucket(): Bucket {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, messages: 0 }
}

export interface Period {
  cost: number
  tokens: number
  messages: number
}

export interface SessionWindow {
  cost: number
  tokens: number
  messages: number
  startsAt: number // block start (ms)
  resetsAt: number // block start + 5h (ms)
  active: boolean // still within the 5h window
}

export interface UsageReport {
  total: Bucket
  today: Period
  week: Period
  month: Period
  session: SessionWindow
  todayResetsAt: number
  weekResetsAt: number
  byModel: Record<string, Bucket>
  byDay: { date: string; cost: number; tokens: number }[]
  byProject: { project: string; cost: number; messages: number }[]
  scannedFiles: number
  generatedAt: number
}

const FIVE_HOURS = 5 * 60 * 60 * 1000

function contextWindowFor(model: string): number {
  return model.includes('haiku') ? 200_000 : 1_000_000
}

export interface SessionUsage {
  ok: boolean
  model?: string
  contextTokens: number
  contextWindow: number
  contextPct: number
  cost: number
  durationMs: number
  messages: number
}

// Per-session live budget & cost, read from the claude transcript for a cwd.
export async function sessionUsage(cwd: string, sessionId: string): Promise<SessionUsage> {
  const empty: SessionUsage = {
    ok: false,
    contextTokens: 0,
    contextWindow: 1_000_000,
    contextPct: 0,
    cost: 0,
    durationMs: 0,
    messages: 0
  }
  if (!cwd || !sessionId) return empty
  const slug = cwd.replace(/[/.]/g, '-')
  const file = path.join(CLAUDE_DIR, 'projects', slug, `${sessionId}.jsonl`)
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch {
    return empty
  }
  let cost = 0
  let messages = 0
  let contextTokens = 0
  let model = ''
  let firstTs = 0
  let lastTs = 0
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let obj: any
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    const ts = obj.timestamp ? Date.parse(obj.timestamp) : 0
    if (ts) {
      if (!firstTs) firstTs = ts
      lastTs = ts
    }
    const msg = obj.message
    const u = msg?.usage
    if (msg?.role === 'assistant' && u) {
      const m = msg.model || model || 'claude-opus-4-8'
      model = m
      cost += addUsage({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, messages: 0 } as Bucket, u, m)
      messages += 1
      // current context size = this turn's input (incl. cache) tokens
      contextTokens =
        (u.input_tokens || 0) +
        (u.cache_read_input_tokens || 0) +
        (u.cache_creation_input_tokens || 0)
    }
  }
  const contextWindow = contextWindowFor(model)
  return {
    ok: messages > 0,
    model,
    contextTokens,
    contextWindow,
    contextPct: contextWindow ? Math.min(100, (contextTokens / contextWindow) * 100) : 0,
    cost,
    durationMs: firstTs && lastTs ? lastTs - firstTs : 0,
    messages
  }
}

function addUsage(b: Bucket, u: any, model: string): number {
  const p = priceFor(model)
  const input = u.input_tokens || 0
  const output = u.output_tokens || 0
  const cacheRead = u.cache_read_input_tokens || 0
  const cc = u.cache_creation || {}
  const cw1h = cc.ephemeral_1h_input_tokens || 0
  const cw5m = cc.ephemeral_5m_input_tokens || 0
  const cwOther = Math.max(0, (u.cache_creation_input_tokens || 0) - cw1h - cw5m)
  const cacheWrite = cw1h + cw5m + cwOther
  // cost in USD
  const cost =
    (input * p.in +
      output * p.out +
      cacheRead * p.in * 0.1 +
      cw5m * p.in * 1.25 +
      cw1h * p.in * 2 +
      cwOther * p.in * 1.25) /
    1_000_000
  b.input += input
  b.output += output
  b.cacheRead += cacheRead
  b.cacheWrite += cacheWrite
  b.cost += cost
  b.messages += 1
  return cost
}

export async function getUsage(days = 30): Promise<UsageReport> {
  const projectsDir = path.join(CLAUDE_DIR, 'projects')
  const projects = await safeReadDir(projectsDir)
  const total = emptyBucket()
  const byModel: Record<string, Bucket> = {}
  const byDayMap: Record<string, { cost: number; tokens: number; messages: number }> = {}
  const byProjectMap: Record<string, { cost: number; messages: number }> = {}
  let scannedFiles = 0

  const now = new Date()
  const nowMs = now.getTime()
  const todayStr = now.toISOString().slice(0, 10)
  const weekAgoStr = new Date(nowMs - 7 * 86400000).toISOString().slice(0, 10)
  const monthAgoStr = new Date(nowMs - 30 * 86400000).toISOString().slice(0, 10)
  // recent messages (last 12h) for building the current 5-hour session block
  const recent: { t: number; cost: number; tokens: number }[] = []

  for (const proj of projects) {
    const dir = path.join(projectsDir, proj)
    const files = (await safeReadDir(dir)).filter((f) => f.endsWith('.jsonl'))
    for (const f of files) {
      scannedFiles++
      let text: string
      try {
        text = await fs.readFile(path.join(dir, f), 'utf8')
      } catch {
        continue
      }
      for (const line of text.split('\n')) {
        if (!line.includes('"usage"')) continue
        let obj: any
        try {
          obj = JSON.parse(line)
        } catch {
          continue
        }
        const u = obj?.message?.usage
        const model = obj?.message?.model
        if (!u || !model || obj.type !== 'assistant') continue
        const cost = addUsage(total, u, model)
        if (!byModel[model]) byModel[model] = emptyBucket()
        addUsage(byModel[model], u, model)
        // per-day
        const day = (obj.timestamp || '').slice(0, 10)
        const tokens =
          (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0)
        if (day) {
          if (!byDayMap[day]) byDayMap[day] = { cost: 0, tokens: 0, messages: 0 }
          byDayMap[day].cost += cost
          byDayMap[day].tokens += tokens
          byDayMap[day].messages += 1
        }
        // recent activity for the 5-hour session window
        const ts = obj.timestamp ? Date.parse(obj.timestamp) : NaN
        if (!isNaN(ts) && nowMs - ts < 12 * 3600 * 1000) {
          recent.push({ t: ts, cost, tokens })
        }
        // per-project
        const cwd = obj.cwd || proj
        if (!byProjectMap[cwd]) byProjectMap[cwd] = { cost: 0, messages: 0 }
        byProjectMap[cwd].cost += cost
        byProjectMap[cwd].messages += 1
      }
    }
  }

  // day / week / month rollups
  const today: Period = { cost: 0, tokens: 0, messages: 0 }
  const week: Period = { cost: 0, tokens: 0, messages: 0 }
  const month: Period = { cost: 0, tokens: 0, messages: 0 }
  for (const [date, v] of Object.entries(byDayMap)) {
    if (date === todayStr) {
      today.cost += v.cost
      today.tokens += v.tokens
      today.messages += v.messages
    }
    if (date >= weekAgoStr) {
      week.cost += v.cost
      week.tokens += v.tokens
      week.messages += v.messages
    }
    if (date >= monthAgoStr) {
      month.cost += v.cost
      month.tokens += v.tokens
      month.messages += v.messages
    }
  }

  const byDay = Object.entries(byDayMap)
    .map(([date, v]) => ({ date, cost: v.cost, tokens: v.tokens }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, days)
    .reverse()

  const byProject = Object.entries(byProjectMap)
    .map(([project, v]) => ({ project, ...v }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 12)

  // current 5-hour session block (ccusage-style): a block starts at the first
  // message (floored to the hour) and lasts 5h; a >5h gap starts a new block.
  recent.sort((a, b) => a.t - b.t)
  const session: SessionWindow = {
    cost: 0,
    tokens: 0,
    messages: 0,
    startsAt: 0,
    resetsAt: 0,
    active: false
  }
  let blockStart = 0
  let lastT = 0
  let cur: { cost: number; tokens: number; messages: number; start: number } | null = null
  for (const m of recent) {
    const newBlock = !cur || m.t - blockStart >= FIVE_HOURS || m.t - lastT >= FIVE_HOURS
    if (newBlock) {
      blockStart = Math.floor(m.t / 3600000) * 3600000 // floor to hour
      cur = { cost: 0, tokens: 0, messages: 0, start: blockStart }
    }
    cur!.cost += m.cost
    cur!.tokens += m.tokens
    cur!.messages += 1
    lastT = m.t
  }
  if (cur) {
    session.cost = cur.cost
    session.tokens = cur.tokens
    session.messages = cur.messages
    session.startsAt = cur.start
    session.resetsAt = cur.start + FIVE_HOURS
    session.active = nowMs < session.resetsAt
  }

  // daily reset = next local midnight; weekly reset = next Monday 00:00 local
  const tomorrow = new Date(now)
  tomorrow.setHours(24, 0, 0, 0)
  const todayResetsAt = tomorrow.getTime()
  const nextMon = new Date(now)
  nextMon.setHours(0, 0, 0, 0)
  const daysUntilMon = ((8 - now.getDay()) % 7) || 7
  nextMon.setDate(nextMon.getDate() + daysUntilMon)
  const weekResetsAt = nextMon.getTime()

  return {
    total,
    today,
    week,
    month,
    session,
    todayResetsAt,
    weekResetsAt,
    byModel,
    byDay,
    byProject,
    scannedFiles,
    generatedAt: nowMs
  }
}
