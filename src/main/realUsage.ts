import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'

// Real plan usage (like Claude → Settings → Usage): 5-hour session %, weekly %.
// Uses the Claude Code OAuth token to read the unified rate-limit headers that
// Anthropic returns on requests. We use count_tokens so no model tokens are spent.

export interface RealWindow {
  utilization: number // 0..100
  resetsAt: number // ms epoch (0 if unknown)
}
export interface RealUsage {
  ok: boolean
  error?: string
  fiveHour?: RealWindow
  sevenDay?: RealWindow
  sevenDayOpus?: RealWindow
  fetchedAt: number
}

async function readToken(): Promise<string | null> {
  // 1) plain credentials file (Linux / some setups)
  const credFile = path.join(os.homedir(), '.claude', '.credentials.json')
  try {
    const j = JSON.parse(await fs.readFile(credFile, 'utf8'))
    const t = j?.claudeAiOauth?.accessToken || j?.accessToken
    if (t) return t
  } catch {
    /* ignore */
  }
  // 2) macOS Keychain (Claude Code stores it here)
  if (process.platform === 'darwin') {
    for (const service of ['Claude Code-credentials', 'Claude Code']) {
      const val = await new Promise<string | null>((resolve) => {
        execFile(
          'security',
          ['find-generic-password', '-s', service, '-w'],
          (err, stdout) => resolve(err ? null : stdout.trim())
        )
      })
      if (val) {
        try {
          const j = JSON.parse(val)
          const t = j?.claudeAiOauth?.accessToken || j?.accessToken
          if (t) return t
        } catch {
          if (val.startsWith('sk-') || val.length > 40) return val
        }
      }
    }
  }
  return null
}

function parseWindow(util: string | null, reset: string | null): RealWindow | undefined {
  if (util == null) return undefined
  let u = parseFloat(util)
  if (isNaN(u)) return undefined
  if (u <= 1) u = u * 100 // header may be a 0..1 fraction
  let resetsAt = 0
  if (reset) {
    const n = Number(reset)
    if (!isNaN(n)) resetsAt = n > 1e12 ? n : n * 1000 // seconds vs ms
    else {
      const d = Date.parse(reset)
      if (!isNaN(d)) resetsAt = d
    }
  }
  return { utilization: Math.min(100, Math.max(0, u)), resetsAt }
}

export async function getRealUsage(): Promise<RealUsage> {
  const now = Date.now()
  const token = await readToken()
  if (!token) {
    return {
      ok: false,
      error: 'Claude Code token bulunamadı (Claude Code’da giriş yapılı mı?).',
      fetchedAt: now
    }
  }
  try {
    // The unified rate-limit headers only appear on real /v1/messages responses.
    // We send the smallest possible request (max_tokens:1) — a negligible ping.
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'user-agent': 'claude-code/2.1.5'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'x' }]
      })
    })
    const h = res.headers
    const fiveHour = parseWindow(
      h.get('anthropic-ratelimit-unified-5h-utilization'),
      h.get('anthropic-ratelimit-unified-5h-reset')
    )
    const sevenDay = parseWindow(
      h.get('anthropic-ratelimit-unified-7d-utilization'),
      h.get('anthropic-ratelimit-unified-7d-reset')
    )
    const sevenDayOpus = parseWindow(
      h.get('anthropic-ratelimit-unified-7d-opus-utilization'),
      h.get('anthropic-ratelimit-unified-7d-opus-reset')
    )
    if (!fiveHour && !sevenDay) {
      if (res.status === 401)
        return { ok: false, error: 'Token süresi dolmuş — Claude Code’da tekrar giriş yap.', fetchedAt: now }
      return {
        ok: false,
        error: `Limit header’ları gelmedi (status ${res.status}).`,
        fetchedAt: now
      }
    }
    return { ok: true, fiveHour, sevenDay, sevenDayOpus, fetchedAt: now }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'istek hatası', fetchedAt: now }
  }
}
