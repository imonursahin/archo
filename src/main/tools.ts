import { promises as fs } from 'fs'
import path from 'path'
import https from 'https'
import { safeStorage } from 'electron'

// "Tools" dashboard data: my open GitHub PRs, PRs waiting on my review, and my
// open Jira issues. Both integrations authenticate with a personal access token
// entered in Settings and encrypted with the OS keychain — no local CLI is
// assumed, since not every machine has `gh` installed or logged in.

export interface PrItem {
  id: string
  number: number
  title: string
  repo: string
  url: string
  author?: string
  isDraft: boolean
  updatedAt: string
}

export interface JiraItem {
  key: string
  summary: string
  status: string
  statusCategory: string // 'new' | 'indeterminate' | 'done'
  type: string
  priority?: string
  project: string
  url: string
  updated: string
  statusChanged: string // when it last moved between status CATEGORIES
}

// ---------- shared HTTPS helper ----------

function getJson(
  url: string,
  headers: Record<string, string>
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers, timeout: 15000 }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode || 0, body }))
    })
    req.on('timeout', () => req.destroy(new Error('request timed out')))
    req.on('error', reject)
    req.end()
  })
}

function postJson(
  url: string,
  headers: Record<string, string>,
  payload: unknown
): Promise<{ status: number; body: string }> {
  const data = JSON.stringify(payload)
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          ...headers,
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

// ---------- GitHub (personal access token) ----------

const GH_API = 'https://api.github.com'

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    // GitHub rejects API requests without one
    'User-Agent': 'Archo'
  }
}

async function ghSearchPrs(token: string, qualifier: string): Promise<PrItem[]> {
  const q = encodeURIComponent(`is:pr is:open ${qualifier}`)
  const { status, body } = await getJson(
    `${GH_API}/search/issues?q=${q}&per_page=50&sort=updated`,
    ghHeaders(token)
  )
  if (status >= 400) throw new Error(`HTTP ${status}`)
  const json = JSON.parse(body)
  return (json.items || []).map(
    (i: {
      number: number
      title: string
      html_url: string
      updated_at: string
      draft?: boolean
      repository_url?: string
      user?: { login?: string }
    }): PrItem => ({
      id: i.html_url,
      number: i.number,
      title: i.title,
      // search/issues has no repo object — it's the tail of repository_url
      repo: (i.repository_url || '').replace(`${GH_API}/repos/`, ''),
      url: i.html_url,
      author: i.user?.login,
      isDraft: !!i.draft,
      updatedAt: i.updated_at
    })
  )
}

export async function githubTools(): Promise<{
  mine: PrItem[]
  reviews: PrItem[]
  error?: string
}> {
  const raw = await readGhRaw()
  if (!raw?.token) return { mine: [], reviews: [], error: 'not-configured' }
  let token: string
  try {
    token = safeStorage.decryptString(Buffer.from(raw.token, 'base64'))
  } catch {
    return {
      mine: [],
      reviews: [],
      error: 'Stored token could not be decrypted — re-enter it in Settings'
    }
  }
  // the search qualifiers need the actual login; @me only works in the gh CLI
  const login = raw.login
  if (!login) return { mine: [], reviews: [], error: 'not-configured' }
  try {
    const [mine, reviews] = await Promise.all([
      ghSearchPrs(token, `author:${login}`),
      ghSearchPrs(token, `review-requested:${login}`)
    ])
    return { mine, reviews }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      mine: [],
      reviews: [],
      error: /401|403/.test(msg)
        ? 'GitHub rejected the token — check it has the `repo` scope and is not expired'
        : msg
    }
  }
}

let ghCredPath = ''

async function readGhRaw(): Promise<{ token: string; login: string } | null> {
  try {
    return JSON.parse(await fs.readFile(ghCredPath, 'utf8'))
  } catch {
    return null
  }
}

export async function getGithubConfig(): Promise<{ hasToken: boolean; login: string }> {
  const raw = await readGhRaw()
  return { hasToken: !!raw?.token, login: raw?.login || '' }
}

export async function setGithubConfig(input: {
  token: string
}): Promise<{ ok: boolean; login?: string; error?: string }> {
  if (!input.token.trim()) return { ok: false, error: 'token is required' }
  if (!safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'OS keychain unavailable — cannot store the token safely' }
  }
  try {
    // resolve (and thereby validate) the login before persisting anything —
    // storing a token that can't even identify itself just fails later, silently
    const { status, body } = await getJson(`${GH_API}/user`, ghHeaders(input.token))
    if (status === 401) return { ok: false, error: 'GitHub rejected the token (401)' }
    if (status >= 400) return { ok: false, error: `GitHub returned HTTP ${status}` }
    const login = JSON.parse(body).login as string
    if (!login) return { ok: false, error: 'GitHub did not return a user login' }
    await fs.writeFile(
      ghCredPath,
      JSON.stringify(
        { token: safeStorage.encryptString(input.token).toString('base64'), login },
        null,
        2
      ),
      { encoding: 'utf8', mode: 0o600 }
    )
    return { ok: true, login }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function clearGithubConfig(): Promise<void> {
  await fs.rm(ghCredPath, { force: true }).catch(() => {})
}

// ---------- Jira ----------

export interface JiraConfig {
  baseUrl: string
  email: string
}

let credPath = ''
export function setToolsPaths(userData: string): void {
  credPath = path.join(userData, 'jira-credentials.json')
  ghCredPath = path.join(userData, 'github-credentials.json')
}

// The API token is encrypted with Electron safeStorage (macOS Keychain-backed)
// and never leaves the main process — the renderer only ever learns whether one
// is set, not its value.
export async function getJiraConfig(): Promise<JiraConfig & { hasToken: boolean }> {
  try {
    const j = JSON.parse(await fs.readFile(credPath, 'utf8'))
    return { baseUrl: j.baseUrl || '', email: j.email || '', hasToken: !!j.token }
  } catch {
    return { baseUrl: '', email: '', hasToken: false }
  }
}

export async function setJiraConfig(input: {
  baseUrl: string
  email: string
  token?: string // omitted = keep the stored one
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const prev = await readRaw()
    let token = prev?.token || ''
    if (input.token) {
      if (!safeStorage.isEncryptionAvailable()) {
        return { ok: false, error: 'OS keychain unavailable — cannot store the token safely' }
      }
      token = safeStorage.encryptString(input.token).toString('base64')
    }
    const baseUrl = input.baseUrl.trim().replace(/\/+$/, '')
    await fs.writeFile(
      credPath,
      JSON.stringify({ baseUrl, email: input.email.trim(), token }, null, 2),
      { encoding: 'utf8', mode: 0o600 }
    )
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function clearJiraConfig(): Promise<void> {
  await fs.rm(credPath, { force: true }).catch(() => {})
}

async function readRaw(): Promise<{ baseUrl: string; email: string; token: string } | null> {
  try {
    return JSON.parse(await fs.readFile(credPath, 'utf8'))
  } catch {
    return null
  }
}

// openSprints() = sprints that are started but not yet completed. Issues in a
// project with no board/sprint won't match at all — that's inherent to scoping
// the list to the active sprint instead of the whole backlog.
// No status filter on purpose: the board shows EVERY column you have work in,
// Done included, so the sprint view matches what the real board looks like.
const JQL = 'assignee = currentUser() AND sprint in openSprints() ORDER BY updated DESC'

async function jiraSearch(jql: string): Promise<{ issues: JiraItem[]; error?: string }> {
  const raw = await readRaw()
  if (!raw?.baseUrl || !raw.email || !raw.token) {
    return { issues: [], error: 'not-configured' }
  }
  let token: string
  try {
    token = safeStorage.decryptString(Buffer.from(raw.token, 'base64'))
  } catch {
    return { issues: [], error: 'Stored token could not be decrypted — re-enter it in Settings' }
  }
  const auth = Buffer.from(`${raw.email}:${token}`).toString('base64')
  const url =
    `${raw.baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}` +
    `&maxResults=50&fields=summary,status,issuetype,priority,project,updated,statuscategorychangedate`
  try {
    const { status, body } = await getJson(url, {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json'
    })
    if (status === 401 || status === 403) {
      return { issues: [], error: 'Jira rejected the credentials (401/403) — check email + API token' }
    }
    if (status >= 400) return { issues: [], error: `Jira returned HTTP ${status}` }
    const json = JSON.parse(body)
    const issues = (json.issues || []).map(
      (i: {
        key: string
        fields: {
          summary?: string
          updated?: string
          statuscategorychangedate?: string
          status?: { name?: string; statusCategory?: { key?: string } }
          issuetype?: { name?: string }
          priority?: { name?: string }
          project?: { key?: string }
        }
      }): JiraItem => ({
        key: i.key,
        summary: i.fields?.summary || '',
        status: i.fields?.status?.name || '—',
        statusCategory: i.fields?.status?.statusCategory?.key || 'new',
        type: i.fields?.issuetype?.name || '',
        priority: i.fields?.priority?.name,
        project: i.fields?.project?.key || '',
        url: `${raw.baseUrl}/browse/${i.key}`,
        updated: i.fields?.updated || '',
        // NOTE: this is the status CATEGORY change date — moving between two
        // columns of the same category (In Progress → In Review) does not reset
        // it. Exact per-column dwell time would need the changelog, one extra
        // request per issue.
        statusChanged: i.fields?.statuscategorychangedate || i.fields?.updated || ''
      })
    )
    return { issues }
  } catch (e) {
    return { issues: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export function jiraTools(): Promise<{ issues: JiraItem[]; error?: string }> {
  return jiraSearch(JQL)
}

// A single ticket by key — used to show the live status of the ticket a session
// is bound to, without pulling the whole sprint again.
export async function jiraIssue(key: string): Promise<{ issue?: JiraItem; error?: string }> {
  const clean = key.trim().toUpperCase()
  if (!/^[A-Z][A-Z0-9]*-\d+$/.test(clean)) return { error: 'invalid issue key' }
  const r = await jiraSearch(`key = "${clean}"`)
  if (r.error) return { error: r.error }
  return { issue: r.issues[0] }
}

// ---------- Jira transitions (move a ticket to another column) ----------

export interface JiraTransition {
  id: string
  name: string
  to: string
  toCategory: string
}

// Basic-auth header for the stored Jira credentials, or null when they're
// missing/undecryptable. Shared by the transition calls below.
async function jiraAuth(): Promise<{ auth: string; baseUrl: string } | null> {
  const raw = await readRaw()
  if (!raw?.baseUrl || !raw.email || !raw.token) return null
  try {
    const token = safeStorage.decryptString(Buffer.from(raw.token, 'base64'))
    return {
      auth: Buffer.from(`${raw.email}:${token}`).toString('base64'),
      baseUrl: raw.baseUrl
    }
  } catch {
    return null
  }
}

export async function jiraTransitions(
  key: string
): Promise<{ transitions: JiraTransition[]; error?: string }> {
  const a = await jiraAuth()
  if (!a) return { transitions: [], error: 'not-configured' }
  try {
    const { status, body } = await getJson(
      `${a.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
      { Authorization: `Basic ${a.auth}`, Accept: 'application/json' }
    )
    if (status >= 400) return { transitions: [], error: `Jira returned HTTP ${status}` }
    const json = JSON.parse(body)
    return {
      transitions: (json.transitions || []).map(
        (tr: {
          id: string
          name: string
          to?: { name?: string; statusCategory?: { key?: string } }
        }): JiraTransition => ({
          id: tr.id,
          name: tr.name,
          to: tr.to?.name || tr.name,
          toCategory: tr.to?.statusCategory?.key || 'new'
        })
      )
    }
  } catch (e) {
    return { transitions: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function jiraTransition(
  key: string,
  transitionId: string
): Promise<{ ok: boolean; error?: string }> {
  const a = await jiraAuth()
  if (!a) return { ok: false, error: 'not-configured' }
  try {
    const { status, body } = await postJson(
      `${a.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
      { Authorization: `Basic ${a.auth}` },
      { transition: { id: transitionId } }
    )
    // 204 = moved. Anything else carries Jira's own reason (a required field on
    // the target status is the usual one) — surface it instead of a bare code.
    if (status === 204) return { ok: true }
    let reason = `HTTP ${status}`
    try {
      const j = JSON.parse(body)
      const msgs = [...(j.errorMessages || []), ...Object.values(j.errors || {})]
      if (msgs.length) reason = msgs.join(' · ')
    } catch {
      /* keep the status code */
    }
    return { ok: false, error: reason }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
