import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  clipboard,
  Menu,
  Notification,
  nativeImage,
  powerSaveBlocker
} from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import https from 'https'

const pexec = promisify(execFile)

// ---- update check. Primary path is the public GitHub Releases API (no auth,
// works for every user of the open-source build). Falls back to the local `gh`
// CLI if the API is unreachable or the repo is still private. Unsigned macOS
// can't silent-install, so we notify + open the release page.
const UPDATE_REPO = 'imonursahin/archo'

// keep-awake (powerSaveBlocker) id; -1 when off. Off on every launch.
let caffeineId = -1

function verGt(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true
    if ((pa[i] || 0) < (pb[i] || 0)) return false
  }
  return false
}

function httpsJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        { headers: { 'User-Agent': 'Archo', Accept: 'application/vnd.github+json' } },
        (res) => {
          if (res.statusCode && res.statusCode >= 400) {
            res.resume()
            reject(new Error(`HTTP ${res.statusCode}`))
            return
          }
          let data = ''
          res.on('data', (c) => (data += c))
          res.on('end', () => {
            try {
              resolve(JSON.parse(data))
            } catch (e) {
              reject(e)
            }
          })
        }
      )
      .on('error', reject)
  })
}

const ghEnv = shellEnv

async function latestViaGh(): Promise<{ tag: string; url: string }> {
  const { stdout } = await pexec(
    'gh',
    ['release', 'view', '--repo', UPDATE_REPO, '--json', 'tagName,url'],
    { env: ghEnv() }
  )
  const j = JSON.parse(stdout)
  return { tag: String(j.tagName || ''), url: String(j.url || '') }
}

async function checkUpdate(): Promise<{
  current: string
  latest?: string
  url?: string
  notes?: string
  hasUpdate: boolean
  error?: string
}> {
  const current = app.getVersion()
  let tag = ''
  let url = ''
  let notes = ''
  let err = ''
  try {
    // public releases API — no token, works once the repo is public
    const j = await httpsJson(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`)
    tag = String(j.tag_name || '')
    url = String(j.html_url || '')
    notes = String(j.body || '')
  } catch (e: any) {
    err = String(e?.message || e)
    // fallback: local authenticated gh (covers a still-private repo)
    try {
      const g = await latestViaGh()
      tag = g.tag
      url = g.url
      err = ''
    } catch (e2: any) {
      err = String(e2?.stderr || e2?.message || e2 || err)
    }
  }
  const latest = tag.replace(/^v/, '')
  if (!latest) return { current, hasUpdate: false, error: err.slice(0, 200) }
  return { current, latest, url, notes, hasUpdate: verGt(latest, current) }
}

// Locate Homebrew and whether this app is a brew-cask install (only then can we
// run the one-click update in-app).
function brewBin(): string | null {
  for (const p of ['/opt/homebrew/bin/brew', '/usr/local/bin/brew']) {
    try {
      if (fs.existsSync(p)) return p
    } catch {
      /* ignore */
    }
  }
  return null
}

async function canBrewUpdate(): Promise<boolean> {
  const brew = brewBin()
  if (!brew) return false
  try {
    await pexec(brew, ['list', '--cask', 'archo'], { env: ghEnv() })
    return true
  } catch {
    return false
  }
}

// Run `brew update && brew upgrade --cask archo`, streaming output to the
// renderer via 'update:output' and a final {done, ok}.
function runBrewUpdate(): void {
  const send = (p: unknown): void => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:output', p)
  }
  const brew = brewBin()
  if (!brew) {
    send({ line: 'Homebrew not found.\n', done: true, ok: false })
    return
  }
  const child = spawn('/bin/zsh', ['-c', `"${brew}" update && "${brew}" upgrade --cask archo`], {
    env: ghEnv()
  })
  child.stdout.on('data', (d: Buffer) => send({ line: d.toString() }))
  child.stderr.on('data', (d: Buffer) => send({ line: d.toString() }))
  child.on('error', (e) => send({ line: String(e.message) + '\n', done: true, ok: false }))
  child.on('exit', (code) => send({ done: true, ok: code === 0 }))
}

// App name = Archo, but keep the data store where it already lives (userData
// defaults to appData/<name>, so pin it to the original 'agent-studio' path
// to avoid losing the assistant registry + sessions).
app.setName('Archo')
try {
  app.setPath('userData', path.join(app.getPath('appData'), 'agent-studio'))
} catch {
  /* ignore */
}

// App icon (Archo). In dev __dirname is out/main → project root/resources; in a
// packaged build the resource sits alongside under resourcesPath.
const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(__dirname, '../../resources/icon.png')
import {
  getResources,
  readResourceFile,
  writeResourceFile,
  createResource,
  deleteResourceFile,
  duplicateResourceFile,
  searchResources,
  replaceInResources,
  listAssistants,
  createAssistant,
  deleteAssistant,
  listEngines,
  ASSISTANTS_ROOT,
  getRunInfo,
  assistantBaseDir,
  updateMcpServer,
  updateHookEvent,
  deleteHookEvent,
  deleteMcpServer,
  setMcpEnabled,
  setPluginEnabled,
  exportAssistant,
  importAssistant,
  registerAssistant,
  bridgeStatus,
  linkSkills,
  unlinkSkills,
  setStorePath
} from './assistants'
import {
  listSessions,
  readSession,
  searchTranscripts,
  detectClaudeSession
} from './claude'
import {
  setToolsPaths,
  githubTools,
  jiraTools,
  jiraIssue,
  jiraTransitions,
  jiraTransition,
  getJiraConfig,
  setJiraConfig,
  clearJiraConfig,
  getGithubConfig,
  setGithubConfig,
  clearGithubConfig
} from './tools'
import {
  setGooglePath,
  getGoogleConfig,
  connectGoogle,
  clearGoogleConfig,
  meetingsToday,
  setMeetingAlerts,
  createMeetSpace,
  createMeetingEvent
} from './google'
import {
  setPaths as setSessionPaths,
  listSessions as listTermSessions,
  getSession,
  createSession,
  renameSession,
  updateSessionMeta,
  findTerminal,
  addSessionCheckpoint,
  removeSessionCheckpoint,
  deleteSession,
  addTerminal,
  renameTerminal,
  removeTerminal,
  setTerminalClaude,
  claimClaudeSession,
  resolveResumeId,
  markTerminalRanClaude,
  setTerminalBg,
  setTerminalTags,
  setTerminalJira,
  reorderTerminals,
  deleteSessionsForAssistant,
  readTerminalLog,
  logPathFor,
  listJiraBindings,
  logStats,
  pruneLogs
} from './sessions'
import {
  gitStatus,
  gitRevertFile,
  gitCheckpoint,
  gitRestoreCheckpoint,
  gitBranch,
  repoInfo,
  publishAssistant,
  setRemote,
  pushAssistant,
  pullAssistant,
  cloneAssistant
} from './git'
import { runDoctor } from './doctor'
import { projectSlug, shellEnv } from './shellenv'
import {
  listPlugins,
  listMarketplaces,
  pluginInstall,
  pluginUninstall,
  pluginUpdate,
  pluginEnable,
  pluginDisable,
  marketplaceAdd,
  marketplaceRemove,
  marketplaceUpdate
} from './plugins'
import {
  createTerm,
  writeTerm,
  resizeTerm,
  killTerm,
  killAll,
  liveTermIds,
  isLive,
  snapshot,
  foreground,
  recentOutput
} from './pty'
import { testMcp, callMcpTool } from './mcpClient'
import { getUsage, sessionUsage } from './usage'
import { getRealUsage } from './realUsage'

let mainWindow: BrowserWindow | null = null

// watch the active assistant's folder so the sidebar auto-refreshes when
// files change (e.g. an MCP installed from a terminal, a skill added by hand)
let resWatcher: fs.FSWatcher | null = null
let resWatchTimer: ReturnType<typeof setTimeout> | null = null
async function startResourceWatch(assistantId: string): Promise<void> {
  resWatcher?.close()
  resWatcher = null
  const dir = await assistantBaseDir(assistantId)
  if (!dir) return
  try {
    resWatcher = fs.watch(dir, { recursive: true }, (_e, file) => {
      if (file && String(file).includes('node_modules')) return
      if (resWatchTimer) clearTimeout(resWatchTimer)
      resWatchTimer = setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed())
          mainWindow.webContents.send('resources:changed')
      }, 400)
    })
  } catch {
    /* ignore */
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    icon: ICON_PATH,
    // hiddenInset is a macOS concept; elsewhere the native bar stays and the
    // renderer must not reserve space for traffic lights
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    backgroundColor: '#0d0d0f',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize() // open filling the screen every launch
    mainWindow?.show()
  })

  // forward renderer console + crashes to main stdout for debugging
  mainWindow.webContents.on('console-message', (_e, level, message) => {
    console.log(`[renderer:${level}] ${message}`)
  })
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.log('[renderer-gone]', JSON.stringify(details))
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// wrap invoke handlers so main-side errors are logged (not just silently rejected)
function handle(channel: string, fn: (...a: any[]) => any): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return await fn(...args)
    } catch (err: any) {
      console.log(`[ipc-error] ${channel}: ${err?.stack || err?.message || err}`)
      throw err
    }
  })
}

// Claude is either working or waiting on a prompt that reads single keys (a
// permission select, a resume list). Typed input means something else entirely
// there — a digit in the name picks an option and the trailing Return confirms
// it — so a rename must never reach the pty in that state.
const CLAUDE_BUSY_RE = /esc to interrupt|ctrl-c to interrupt|Do you want|❯\s*\d[.)]/i

// Mirror a tab rename onto the Claude session running in that terminal, so the
// conversation carries the same name in /resume. Sent as typed input because
// /rename is a slash command; only while Claude is the foreground process and
// showing an ordinary input box — at a shell prompt the same line would just be
// an unknown command.
// ponytail: a rename typed while an unsent message is half-written in Claude's
// input box appends to it; deferring until the box is empty needs state the pty
// doesn't expose. Renaming from the tab is skipped, not queued, when in doubt.
function syncClaudeTitle(terminalId: string, name: string): void {
  if (!/claude/i.test(foreground(terminalId))) return
  if (CLAUDE_BUSY_RE.test(recentOutput(terminalId))) return
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 60)
  if (clean) writeTerm(terminalId, `/rename ${clean}\r`)
}

function registerIpc(): void {
  // assistants + engines
  handle('engines:list', () => listEngines())
  handle('assistants:list', () => listAssistants())
  handle('assistant:create', (input) => createAssistant(input))
  handle('assistant:delete', async (id: string, files: boolean) => {
    const baseDir = await assistantBaseDir(id)
    // kill live terminals + wipe the assistant's sessions and recorded logs
    const termIds = await deleteSessionsForAssistant(id)
    for (const tid of termIds) killTerm(tid)
    await deleteAssistant(id, files)
    // when deleting files too, also remove the Claude transcripts for this dir
    if (files && baseDir) {
      const slug = projectSlug(baseDir)
      await fs.promises
        .rm(path.join(os.homedir(), '.claude', 'projects', slug), {
          recursive: true,
          force: true
        })
        .catch(() => {})
    }
  })
  handle('assistant:run', (id: string) => getRunInfo(id))
  // resources
  handle('resources:list', (assistantId: string) => getResources(assistantId))
  handle('resource:read', (file: string) => readResourceFile(file))
  handle('resource:write', (file: string, content: string) => writeResourceFile(file, content))
  handle('resource:create', (input) => createResource(input))
  handle('resource:delete', (file: string) => deleteResourceFile(file))
  handle('resource:duplicate', (file: string) => duplicateResourceFile(file))
  handle('resource:search', (id: string, query: string, opts: unknown) =>
    searchResources(id, query, opts as { regex?: boolean; caseSensitive?: boolean })
  )
  handle('resource:replace', (id: string, query: string, repl: string, opts: unknown) =>
    replaceInResources(
      id,
      query,
      repl,
      opts as { regex?: boolean; caseSensitive?: boolean; paths?: string[] }
    )
  )
  handle('resource:reveal', (file: string) => {
    shell.showItemInFolder(file)
  })
  handle('resources:watch', (assistantId: string) => startResourceWatch(assistantId))
  handle('mcp:test', (cfg: any) => testMcp(cfg))
  handle('mcp:call', (cfg: any, tool: string, args: unknown) => callMcpTool(cfg, tool, args))
  handle('usage:get', () => getUsage())
  handle('usage:real', () => getRealUsage())
  handle('mcp:update', (file: string, name: string, cfg: unknown) =>
    updateMcpServer(file, name, cfg)
  )
  handle('mcp:delete', (file: string, name: string) => deleteMcpServer(file, name))
  handle('hook:update', (file: string, event: string, matchers: unknown) =>
    updateHookEvent(file, event, matchers)
  )
  handle('hook:delete', (file: string, event: string) => deleteHookEvent(file, event))
  handle('mcp:setEnabled', (id: string, name: string, enabled: boolean) =>
    setMcpEnabled(id, name, enabled)
  )
  handle('plugin:setEnabled', (id: string, key: string, enabled: boolean) =>
    setPluginEnabled(id, key, enabled)
  )
  handle('assistant:export', async (id: string, appState: unknown) => {
    const bundle = await exportAssistant(id)
    if (!bundle) return { ok: false as const }
    const res = await dialog.showSaveDialog({
      title: 'Asistanı dışa aktar',
      defaultPath: `${bundle.name}.archo.json`,
      filters: [{ name: 'Archo Asistan', extensions: ['json'] }]
    })
    if (res.canceled || !res.filePath) return { ok: false as const }
    await fs.promises.writeFile(
      res.filePath,
      JSON.stringify({ ...bundle, appState: appState || null }, null, 2),
      'utf8'
    )
    return {
      ok: true as const,
      path: res.filePath,
      files: Object.keys(bundle.files).length,
      dropped: bundle.dropped || []
    }
  })
  handle('assistant:import', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Asistan içe aktar',
      properties: ['openFile'],
      filters: [{ name: 'Archo Asistan', extensions: ['json'] }]
    })
    if (res.canceled || !res.filePaths[0]) return { ok: false as const }
    const raw = await fs.promises.readFile(res.filePaths[0], 'utf8')
    const parsed = JSON.parse(raw)
    const a = await importAssistant(parsed)
    return { ok: true as const, assistant: a, appState: parsed.appState || null }
  })
  // ---- working directory + git (diff / checkpoint) ----
  handle('dir:pick', async (defaultPath?: string) => {
    const res = await dialog.showOpenDialog({
      title: 'Çalışma dizini seç',
      defaultPath,
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return { ok: false as const }
    return { ok: true as const, path: res.filePaths[0] }
  })
  handle('session:setCwd', (id: string, cwd: string) => updateSessionMeta(id, { cwd }))
  handle('git:status', (dir: string) => gitStatus(dir))
  handle('git:revertFile', (dir: string, file: string, untracked: boolean) =>
    gitRevertFile(dir, file, untracked)
  )
  handle('git:checkpoint', async (id: string, dir: string, message: string) => {
    const cp = await gitCheckpoint(dir, message)
    await addSessionCheckpoint(id, cp)
    return cp
  })
  handle('git:restoreCheckpoint', (dir: string, sha: string) => gitRestoreCheckpoint(dir, sha))
  handle('session:removeCheckpoint', (id: string, sha: string) =>
    removeSessionCheckpoint(id, sha)
  )
  // ---- @file context picker: list files in a working dir ----
  handle('fs:listFiles', async (dir: string) => {
    if (!dir) return [] as { path: string; isDir: boolean }[]
    const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|out|\.turbo|coverage|\.venv|__pycache__)(\/|$)/
    const out: { path: string; isDir: boolean }[] = []
    const walk = async (d: string, rel: string): Promise<void> => {
      if (out.length > 4000) return
      let entries: fs.Dirent[] = []
      try {
        entries = await fs.promises.readdir(d, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const rp = rel ? `${rel}/${e.name}` : e.name
        if (SKIP.test(rp) || e.name.startsWith('.DS_Store')) continue
        if (e.isDirectory()) {
          out.push({ path: rp, isDir: true })
          await walk(path.join(d, e.name), rp)
        } else if (e.isFile()) out.push({ path: rp, isDir: false })
      }
    }
    await walk(dir, '')
    return out.sort((a, b) => a.path.localeCompare(b.path))
  })
  // ---- paste screenshot from clipboard → temp png path (for Claude vision) ----
  handle('clipboard:saveImage', async () => {
    const img = clipboard.readImage()
    if (img.isEmpty()) return { ok: false as const }
    const file = path.join(os.tmpdir(), `as-shot-${Date.now()}.png`)
    await fs.promises.writeFile(file, img.toPNG())
    return { ok: true as const, path: file }
  })
  handle('clipboard:hasImage', () => !clipboard.readImage().isEmpty())
  // ---- desktop notification (terminal task finished / waiting) ----
  handle(
    'notify',
    (
      title: string,
      body: string,
      meta?: {
        subtitle?: string
        assistantId?: string
        sessionId?: string
        terminalId?: string
        sound?: string
      }
    ) => {
      if (!Notification.isSupported()) return
      const n = new Notification({
        title,
        subtitle: meta?.subtitle,
        body,
        silent: false,
        sound: meta?.sound || 'Glass' // macOS system sound
      })
      // clicking the notification jumps straight to the related session
      if (meta?.assistantId && meta?.sessionId) {
        n.on('click', () => {
          if (!mainWindow || mainWindow.isDestroyed()) return
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
          mainWindow.webContents.send('notif:click', {
            assistantId: meta.assistantId,
            sessionId: meta.sessionId,
            terminalId: meta.terminalId
          })
        })
      }
      n.show()
    }
  )
  handle('shell:openExternal', (url: string) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })
  handle('term:find', (termId: string) => findTerminal(termId))
  // keep-awake toggle: prevent display/system sleep while long tasks run
  // (like `caffeinate -d`). Released automatically when the app quits.
  handle('caffeine:set', (on: boolean) => {
    if (on) {
      if (caffeineId < 0 || !powerSaveBlocker.isStarted(caffeineId)) {
        caffeineId = powerSaveBlocker.start('prevent-display-sleep')
      }
    } else if (caffeineId >= 0 && powerSaveBlocker.isStarted(caffeineId)) {
      powerSaveBlocker.stop(caffeineId)
      caffeineId = -1
    }
    return caffeineId >= 0 && powerSaveBlocker.isStarted(caffeineId)
  })
  handle('caffeine:get', () => caffeineId >= 0 && powerSaveBlocker.isStarted(caffeineId))
  handle('app:version', () => app.getVersion())
  handle('app:relaunch', () => {
    // After a brew update the fresh app lives at /Applications/Archo.app — open
    // that one (not necessarily the currently-running bundle) so the restart
    // actually picks up the new version.
    const installed = '/Applications/Archo.app'
    try {
      if (fs.existsSync(installed)) {
        spawn('open', ['-n', installed], { detached: true, stdio: 'ignore' }).unref()
        app.exit(0)
        return
      }
    } catch {
      /* ignore */
    }
    app.relaunch()
    app.exit(0)
  })
  handle('update:check', () => checkUpdate())
  handle('update:canBrew', () => canBrewUpdate())
  ipcMain.on('update:run', () => runBrewUpdate())
  handle('git:branch', (dir: string) => gitBranch(dir))
  handle('session:usage', (cwd: string, sessionId: string) => sessionUsage(cwd, sessionId))
  handle('bridge:status', (dir: string) => bridgeStatus(dir))
  handle('bridge:link', (id: string, dir: string) => linkSkills(id, dir))
  handle('bridge:unlink', (dir: string) => unlinkSkills(dir))
  // terminal sessions (cmux-style, per assistant)
  handle('termsessions:list', (assistantId: string) => listTermSessions(assistantId))
  handle('termsession:get', (id: string) => getSession(id))
  handle('termsession:create', (assistantId: string, name: string) =>
    createSession(assistantId, name)
  )
  handle('termsession:rename', (id: string, name: string) => renameSession(id, name))
  handle(
    'termsession:meta',
    (
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
    ) =>
      updateSessionMeta(id, patch)
  )
  handle('termsession:delete', (id: string) => deleteSession(id))
  handle('terminal:add', async (sessionId: string, input) => {
    const t = await addTerminal(sessionId, input || {})
    return { terminal: t, logPath: logPathFor(sessionId, t.id) }
  })
  handle('terminal:rename', async (sessionId: string, terminalId: string, name: string) => {
    if (await renameTerminal(sessionId, terminalId, name)) syncClaudeTitle(terminalId, name)
  })
  handle('terminal:remove', (sessionId: string, terminalId: string) =>
    removeTerminal(sessionId, terminalId)
  )
  handle('terminal:log', (sessionId: string, terminalId: string) =>
    readTerminalLog(sessionId, terminalId)
  )
  handle('terminal:logpath', (sessionId: string, terminalId: string) =>
    logPathFor(sessionId, terminalId)
  )
  handle('terminal:islive', (id: string) => isLive(id))
  handle('terminal:snapshot', (id: string) => snapshot(id))
  handle('claude:detect', (cwd: string, sinceMs: number) => detectClaudeSession(cwd, sinceMs))
  handle(
    'terminal:claimclaude',
    (sessionId: string, terminalId: string, cwd: string, sinceMs: number) =>
      claimClaudeSession(sessionId, terminalId, cwd, sinceMs)
  )
  handle('terminal:resumeid', (sessionId: string, terminalId: string) =>
    resolveResumeId(sessionId, terminalId)
  )
  handle('terminal:ranclaude', (sessionId: string, terminalId: string) =>
    markTerminalRanClaude(sessionId, terminalId)
  )
  handle('terminal:setbg', (sessionId: string, terminalId: string, bg: string) =>
    setTerminalBg(sessionId, terminalId, bg)
  )
  // ---- Tools dashboard (GitHub PRs + Jira issues) ----
  handle('tools:github', () => githubTools())
  handle('tools:jira', () => jiraTools())
  handle('tools:meetings', () => meetingsToday())
  handle('jira:issue', (key: string) => jiraIssue(key))
  handle('sessions:jiraBindings', () => listJiraBindings())
  handle('doctor:run', () => runDoctor(ASSISTANTS_ROOT))
  // ---- plugins & marketplaces (driven through the claude CLI) ----
  handle('plugins:list', async (id: string) => {
    const dir = await assistantBaseDir(id)
    if (!dir) return { ok: false as const, error: 'assistant not found', installed: [], available: [] }
    return listPlugins(dir)
  })
  handle('plugins:marketplaces', async (id: string) => {
    const dir = await assistantBaseDir(id)
    return dir ? listMarketplaces(dir) : []
  })
  handle('plugins:action', async (id: string, action: string, arg: string) => {
    const dir = await assistantBaseDir(id)
    if (!dir) return { ok: false as const, error: 'assistant not found' }
    switch (action) {
      case 'install':
        return pluginInstall(dir, arg)
      case 'uninstall':
        return pluginUninstall(dir, arg)
      case 'update':
        return pluginUpdate(dir, arg)
      case 'enable':
        return pluginEnable(dir, arg)
      case 'disable':
        return pluginDisable(dir, arg)
      case 'marketplaceAdd':
        return marketplaceAdd(dir, arg)
      case 'marketplaceRemove':
        return marketplaceRemove(dir, arg)
      case 'marketplaceUpdate':
        return marketplaceUpdate(dir, arg || undefined)
      default:
        return { ok: false as const, error: `unknown action ${action}` }
    }
  })
  // ---- sharing an assistant as a git repo ----
  handle('share:info', async (id: string) => {
    const dir = await assistantBaseDir(id)
    return dir ? repoInfo(dir) : { isRepo: false }
  })
  handle('share:publish', async (id: string, message: string) => {
    const dir = await assistantBaseDir(id)
    if (!dir) return { ok: false as const, error: 'assistant not found' }
    try {
      const r = await publishAssistant(dir, message || 'Update assistant')
      return { ok: true as const, ...r }
    } catch (e: any) {
      return { ok: false as const, error: String(e?.stderr || e?.message || e) }
    }
  })
  handle('share:setRemote', async (id: string, url: string) => {
    const dir = await assistantBaseDir(id)
    if (!dir) return { ok: false as const, error: 'assistant not found' }
    try {
      await setRemote(dir, url)
      return { ok: true as const }
    } catch (e: any) {
      return { ok: false as const, error: String(e?.stderr || e?.message || e) }
    }
  })
  handle('share:push', async (id: string) => {
    const dir = await assistantBaseDir(id)
    if (!dir) return { ok: false as const, error: 'assistant not found' }
    try {
      return { ok: true as const, output: await pushAssistant(dir, ghEnv()) }
    } catch (e: any) {
      return { ok: false as const, error: String(e?.stderr || e?.message || e) }
    }
  })
  handle('share:pull', async (id: string) => {
    const dir = await assistantBaseDir(id)
    if (!dir) return { ok: false as const, error: 'assistant not found' }
    try {
      return { ok: true as const, output: await pullAssistant(dir, ghEnv()) }
    } catch (e: any) {
      return { ok: false as const, error: String(e?.stderr || e?.message || e) }
    }
  })
  handle('share:clone', async (url: string) => {
    // The folder name comes from an untrusted URL — keep only characters that
    // can name a directory, so no separator or `..` can walk out of the root.
    const name =
      (url.split(/[/\\]/).pop() || 'assistant')
        .replace(/\.git$/, '')
        .replace(/[^\w.-]/g, '-')
        .replace(/^[.-]+/, '')
        .slice(0, 64) || 'assistant'
    let target = path.join(ASSISTANTS_ROOT, name)
    let n = 2
    while (fs.existsSync(target)) target = path.join(ASSISTANTS_ROOT, `${name}-${n++}`)
    try {
      await fs.promises.mkdir(ASSISTANTS_ROOT, { recursive: true })
      await cloneAssistant(url, target, ghEnv())
      const a = await registerAssistant(target)
      return { ok: true as const, assistant: a }
    } catch (e: any) {
      await fs.promises.rm(target, { recursive: true, force: true }).catch(() => {})
      return { ok: false as const, error: String(e?.stderr || e?.message || e) }
    }
  })
  handle('logs:stats', () => logStats())
  handle('logs:prune', (days: number) => pruneLogs(days, liveTermIds()))
  handle('google:getConfig', () => getGoogleConfig())
  handle('google:connect', (input: { clientId: string; clientSecret: string }) =>
    connectGoogle(input)
  )
  handle('google:clearConfig', () => clearGoogleConfig())
  handle('meetings:setAlerts', (on: boolean) => setMeetingAlerts(on))
  handle('meet:createSpace', () => createMeetSpace())
  handle('meet:createEvent', (input: {
    title: string
    startISO: string
    minutes: number
    guests: string[]
    kind?: 'meeting' | 'ooo'
  }) => createMeetingEvent(input))
  handle('jira:transitions', (key: string) => jiraTransitions(key))
  handle('jira:transition', (key: string, id: string) => jiraTransition(key, id))
  handle('jira:getConfig', () => getJiraConfig())
  handle('jira:setConfig', (input: { baseUrl: string; email: string; token?: string }) =>
    setJiraConfig(input)
  )
  handle('jira:clearConfig', () => clearJiraConfig())
  handle('github:getConfig', () => getGithubConfig())
  handle('github:setConfig', (input: { token: string }) => setGithubConfig(input))
  handle('github:clearConfig', () => clearGithubConfig())
  handle('terminal:setjira', (sessionId: string, terminalId: string, key: string) =>
    setTerminalJira(sessionId, terminalId, key)
  )
  handle('terminal:settags', (sessionId: string, terminalId: string, tags: string[]) =>
    setTerminalTags(sessionId, terminalId, tags)
  )
  handle('terminal:reorder', (sessionId: string, orderedIds: string[]) =>
    reorderTerminals(sessionId, orderedIds)
  )
  handle('terminal:setclaude', (sessionId: string, terminalId: string, claudeId: string) =>
    setTerminalClaude(sessionId, terminalId, claudeId)
  )
  // claude transcripts (resume history)
  handle('sessions:list', () => listSessions())
  handle('session:read', (file: string) => readSession(file))
  handle('transcripts:search', (query: string, scope?: string[]) =>
    searchTranscripts(query, scope)
  )
  // PTY
  ipcMain.on('pty:create', (_e, id: string, opts) => {
    if (mainWindow) createTerm(mainWindow, id, opts || {})
  })
  ipcMain.on('pty:write', (_e, id: string, data: string) => writeTerm(id, data))
  ipcMain.on('pty:resize', (_e, id: string, cols: number, rows: number) =>
    resizeTerm(id, cols, rows)
  )
  ipcMain.on('pty:kill', (_e, id: string) => killTerm(id))
}

// Windows/Linux otherwise show Electron's default menu bar, which only adds
// devtools entries and pushes the layout down.
if (process.platform !== 'darwin') Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  // macOS dock icon (dev): the packaged .icns is set at build time
  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(nativeImage.createFromPath(ICON_PATH))
    } catch {
      /* ignore */
    }
  }
  setStorePath(path.join(app.getPath('userData'), 'assistants.json'))
  setSessionPaths(
    path.join(app.getPath('userData'), 'terminal-sessions.json'),
    path.join(app.getPath('userData'), 'session-logs')
  )
  setToolsPaths(app.getPath('userData'))
  setGooglePath(app.getPath('userData'))
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  // auto-check for a newer release shortly after launch; notify (unsigned mac
  // can't silent-install, so we just point the user at the download page)
  setTimeout(async () => {
    try {
      const r = await checkUpdate()
      if (r.hasUpdate && r.url) {
        const n = new Notification({
          title: 'Archo update available',
          body:
            `v${r.latest} is out (you have ${r.current}). Click to download.` +
            // the cask only exists on macOS
            (process.platform === 'darwin'
              ? ' Or run: brew update && brew upgrade --cask archo'
              : ''),
          silent: false
        })
        n.on('click', () => {
          if (r.url) shell.openExternal(r.url)
        })
        n.show()
      }
    } catch {
      /* ignore */
    }
  }, 8000)
})

app.on('window-all-closed', () => {
  killAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => killAll())
