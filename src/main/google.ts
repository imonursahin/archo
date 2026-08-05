import { promises as fs } from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import crypto from 'crypto'
import { shell, safeStorage, Notification } from 'electron'

// Google Calendar → today's meetings + their Meet links, plus creating a
// meeting (instant Meet room, or a calendar event with a Meet link).
//
// Google has no "paste a personal token" story like GitHub/Jira, so this is a
// real OAuth 2.0 desktop flow: loopback redirect + PKCE, with the refresh token
// encrypted by the OS keychain. The user supplies the client id/secret from
// their own Google Cloud project — an open-source app can't ship credentials
// that would then be shared by every install.

// calendar.events (not the read-only scope) because the dashboard can also
// create meetings; meetings.space.created only ever grants access to spaces
// this app itself made, never to anything else in your Meet account.
const SCOPE = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/meetings.space.created',
  // just to show which account is connected in Settings
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ')
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export interface MeetingItem {
  id: string
  title: string
  start: string // ISO; for all-day events this is the date at local midnight
  end: string
  allDay: boolean
  meetUrl?: string
  htmlLink: string
  eventType: string // 'default' | 'outOfOffice' | 'focusTime' | …
}

let credPath = ''
export function setGooglePath(userData: string): void {
  credPath = path.join(userData, 'google-credentials.json')
}

interface Stored {
  clientId: string
  clientSecret: string
  refreshToken: string // safeStorage-encrypted, base64
  email?: string
}

async function readStored(): Promise<Stored | null> {
  try {
    return JSON.parse(await fs.readFile(credPath, 'utf8'))
  } catch {
    return null
  }
}

async function writeStored(s: Stored): Promise<void> {
  await fs.writeFile(credPath, JSON.stringify(s, null, 2), { encoding: 'utf8', mode: 0o600 })
}

export async function getGoogleConfig(): Promise<{
  hasClient: boolean
  connected: boolean
  email: string
}> {
  const s = await readStored()
  return {
    hasClient: !!s?.clientId,
    connected: !!s?.refreshToken,
    email: s?.email || ''
  }
}

export async function clearGoogleConfig(): Promise<void> {
  await fs.rm(credPath, { force: true }).catch(() => {})
  cachedAccess = null
}

// ---------- HTTP helpers ----------

function post(url: string, form: Record<string, string>): Promise<{ status: number; body: string }> {
  const data = new URLSearchParams(form).toString()
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 15000
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode || 0, body }))
      }
    )
    req.on('timeout', () => req.destroy(new Error('request timed out')))
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function get(url: string, token: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        timeout: 15000
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode || 0, body }))
      }
    )
    req.on('timeout', () => req.destroy(new Error('request timed out')))
    req.on('error', reject)
    req.end()
  })
}

// ---------- OAuth ----------

// Runs the loopback consent flow and stores the refresh token. Resolves only
// once Google has redirected back, so the caller can report a real result.
export async function connectGoogle(input: {
  clientId: string
  clientSecret: string
}): Promise<{ ok: boolean; email?: string; error?: string }> {
  const clientId = input.clientId.trim()
  const clientSecret = input.clientSecret.trim()
  if (!clientId || !clientSecret) return { ok: false, error: 'client id and secret are required' }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'OS keychain unavailable — cannot store the token safely' }
  }

  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  const state = crypto.randomBytes(16).toString('hex')

  return new Promise((resolve) => {
    let settled = false
    const finish = (r: { ok: boolean; email?: string; error?: string }): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.close()
      resolve(r)
    }

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      if (url.pathname !== '/') {
        res.writeHead(404).end()
        return
      }
      const reply = (msg: string): void => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          `<!doctype html><meta charset="utf-8"><body style="font:15px -apple-system;padding:40px">${msg}</body>`
        )
      }
      if (url.searchParams.get('state') !== state) {
        reply('State mismatch — close this and try again.')
        finish({ ok: false, error: 'OAuth state mismatch' })
        return
      }
      const err = url.searchParams.get('error')
      if (err) {
        reply('Authorization denied. You can close this tab.')
        finish({ ok: false, error: err })
        return
      }
      const code = url.searchParams.get('code') || ''
      reply('Archo is connected to Google Calendar. You can close this tab.')
      try {
        const port = (server.address() as { port: number }).port
        const tok = await post(TOKEN_URL, {
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `http://127.0.0.1:${port}`,
          grant_type: 'authorization_code',
          code_verifier: verifier
        })
        const j = JSON.parse(tok.body)
        if (tok.status >= 400 || !j.refresh_token) {
          finish({
            ok: false,
            error: j.error_description || j.error || `token exchange failed (HTTP ${tok.status})`
          })
          return
        }
        // whose calendar this is — shown in Settings so a wrong account is obvious
        let email = ''
        try {
          const me = await get('https://www.googleapis.com/oauth2/v2/userinfo', j.access_token)
          email = JSON.parse(me.body).email || ''
        } catch {
          /* non-fatal */
        }
        await writeStored({
          clientId,
          clientSecret,
          refreshToken: safeStorage.encryptString(j.refresh_token).toString('base64'),
          email
        })
        cachedAccess = { token: j.access_token, expiresAt: Date.now() + (j.expires_in || 3600) * 1000 }
        finish({ ok: true, email })
      } catch (e) {
        finish({ ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    })

    // give up rather than leaking a listening socket if the user walks away
    const timer = setTimeout(() => finish({ ok: false, error: 'timed out waiting for Google' }), 180_000)

    server.on('error', (e) => finish({ ok: false, error: e.message }))
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `http://127.0.0.1:${port}`,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent', // force a refresh_token even on a re-connect
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state
      })
      shell.openExternal(`${AUTH_URL}?${params}`)
    })
  })
}

let cachedAccess: { token: string; expiresAt: number } | null = null

async function accessToken(): Promise<{ token?: string; error?: string }> {
  if (cachedAccess && cachedAccess.expiresAt > Date.now() + 60_000) {
    return { token: cachedAccess.token }
  }
  const s = await readStored()
  if (!s?.refreshToken) return { error: 'not-configured' }
  let refresh: string
  try {
    refresh = safeStorage.decryptString(Buffer.from(s.refreshToken, 'base64'))
  } catch {
    return { error: 'Stored Google token could not be decrypted — reconnect in Settings' }
  }
  const r = await post(TOKEN_URL, {
    client_id: s.clientId,
    client_secret: s.clientSecret,
    refresh_token: refresh,
    grant_type: 'refresh_token'
  })
  const j = JSON.parse(r.body || '{}')
  if (r.status >= 400 || !j.access_token) {
    return { error: j.error_description || j.error || `refresh failed (HTTP ${r.status})` }
  }
  cachedAccess = { token: j.access_token, expiresAt: Date.now() + (j.expires_in || 3600) * 1000 }
  return { token: j.access_token }
}

// ---------- Today's meetings ----------

export async function meetingsToday(): Promise<{ meetings: MeetingItem[]; error?: string }> {
  const at = await accessToken()
  if (!at.token) return { meetings: [], error: at.error }
  // the whole day, not just what's left of it — a finished meeting is still
  // context you want ("was that at 10 or 11?"), and the UI dims past ones
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date()
  endOfDay.setHours(23, 59, 59, 999)
  // singleEvents=true is the whole point of going through the API: Google
  // expands recurring events server-side, so a daily standup actually shows up.
  const url =
    'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
    `?timeMin=${encodeURIComponent(startOfDay.toISOString())}` +
    `&timeMax=${encodeURIComponent(endOfDay.toISOString())}` +
    '&singleEvents=true&orderBy=startTime&maxResults=25'
  try {
    const { status, body } = await get(url, at.token)
    if (status >= 400) return { meetings: [], error: `Google returned HTTP ${status}` }
    const json = JSON.parse(body)
    const meetings: MeetingItem[] = (json.items || [])
      .filter((e: { status?: string }) => e.status !== 'cancelled')
      .map(
        (e: {
          id: string
          summary?: string
          htmlLink?: string
          hangoutLink?: string
          eventType?: string
          start?: { dateTime?: string; date?: string }
          end?: { dateTime?: string; date?: string }
          conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
        }): MeetingItem => {
          const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')
          return {
            id: e.id,
            title: e.summary || '(no title)',
            start: e.start?.dateTime || e.start?.date || '',
            end: e.end?.dateTime || e.end?.date || '',
            allDay: !e.start?.dateTime,
            meetUrl: e.hangoutLink || video?.uri,
            htmlLink: e.htmlLink || '',
            eventType: e.eventType || 'default'
          }
        }
      )
    return { meetings }
  } catch (e) {
    return { meetings: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// ---------- "starts in 5 minutes" alerts ----------
//
// Lives in main, not the renderer: the reminder has to fire whether or not the
// Tools tab is open, or it's useless exactly when you're heads-down in a
// terminal and about to miss the call.

const LEAD_MS = 5 * 60_000
let watchTimer: ReturnType<typeof setInterval> | null = null
const notified = new Set<string>()

async function checkUpcoming(): Promise<void> {
  const { meetings } = await meetingsToday()
  const now = Date.now()
  for (const m of meetings) {
    if (m.allDay || !m.start || notified.has(m.id)) continue
    const startsIn = new Date(m.start).getTime() - now
    // only the window between the lead time and the start — a meeting already
    // running shouldn't page you, and one 3 hours out isn't news yet
    if (startsIn <= 0 || startsIn > LEAD_MS) continue
    notified.add(m.id)
    const mins = Math.max(1, Math.round(startsIn / 60_000))
    const n = new Notification({
      title: m.title,
      body: m.meetUrl ? `starts in ${mins} min · click to join` : `starts in ${mins} min`,
      silent: false
    })
    const link = m.meetUrl || m.htmlLink
    if (link) n.on('click', () => shell.openExternal(link))
    n.show()
  }
  // ids are per-occurrence, so this only needs to stay bounded, not accurate
  if (notified.size > 200) notified.clear()
}

export function setMeetingAlerts(on: boolean): void {
  if (watchTimer) {
    clearInterval(watchTimer)
    watchTimer = null
  }
  if (!on) return
  // 60s is fine for a 5-minute lead and costs one cheap API call a minute
  watchTimer = setInterval(() => void checkUpcoming(), 60_000)
  void checkUpcoming()
}

// ---------- Creating meetings ----------

// Instant Meet link, with no calendar entry at all. Uses the Meet API's
// spaces.create — the narrow `meetings.space.created` scope covers exactly
// this and nothing else, so "give me a room now" never needs write access to
// the calendar.
export async function createMeetSpace(): Promise<{ url?: string; error?: string }> {
  const at = await accessToken()
  if (!at.token) return { error: at.error }
  try {
    const { status, body } = await postAuth(
      'https://meet.googleapis.com/v2/spaces',
      at.token,
      {}
    )
    const j = JSON.parse(body || '{}')
    if (status >= 400) {
      return { error: j.error?.message || `Meet API returned HTTP ${status}` }
    }
    if (!j.meetingUri) return { error: 'Meet did not return a meeting link' }
    return { url: j.meetingUri }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

// A real calendar event with a Meet link attached. conferenceDataVersion=1 is
// required or Google silently drops the createRequest and you get an event
// with no link.
export async function createMeetingEvent(input: {
  title: string
  startISO: string
  minutes: number
  guests: string[]
  kind?: 'meeting' | 'ooo'
}): Promise<{ url?: string; htmlLink?: string; error?: string }> {
  const at = await accessToken()
  if (!at.token) return { error: at.error }
  const start = new Date(input.startISO)
  if (isNaN(start.getTime())) return { error: 'invalid start time' }
  const end = new Date(start.getTime() + Math.max(5, input.minutes) * 60_000)
  const ooo = input.kind === 'ooo'
  // Out-of-office is its own event type: Google rejects attendees and
  // conferencing on it, and it's what makes the block show as away rather than
  // as just another meeting.
  const payload = ooo
    ? {
        summary: input.title || 'Out of office',
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        eventType: 'outOfOffice',
        // declineNone on purpose: silently auto-declining other people's
        // invitations is not something a side button should do behind your back
        outOfOfficeProperties: { autoDeclineMode: 'declineNone' }
      }
    : {
        summary: input.title || 'Meeting',
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        attendees: input.guests.filter(Boolean).map((email) => ({ email })),
        conferenceData: {
          // requestId only needs to be unique per request; the timestamp is enough
          createRequest: {
            requestId: `archo-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      }
  try {
    const { status, body } = await postAuth(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
      at.token,
      payload
    )
    const j = JSON.parse(body || '{}')
    if (status >= 400) {
      return { error: j.error?.message || `Calendar returned HTTP ${status}` }
    }
    const video = j.conferenceData?.entryPoints?.find(
      (p: { entryPointType?: string }) => p.entryPointType === 'video'
    )
    return { url: j.hangoutLink || video?.uri, htmlLink: j.htmlLink }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

function postAuth(
  url: string,
  token: string,
  payload: unknown
): Promise<{ status: number; body: string }> {
  const data = JSON.stringify(payload)
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        },
        timeout: 15000
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode || 0, body }))
      }
    )
    req.on('timeout', () => req.destroy(new Error('request timed out')))
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}
