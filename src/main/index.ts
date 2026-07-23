import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  dialog,
  clipboard,
  Notification,
  nativeImage
} from 'electron'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const pexec = promisify(execFile)

// ---- update check via the user's authenticated `gh` CLI (no embedded token;
// works with a private repo). Compares the latest GitHub release to this app's
// version. Unsigned macOS can't silent-install, so we notify + open the page.
const UPDATE_REPO = 'imonursahin/archo'

function ghEnv(): NodeJS.ProcessEnv {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']
  const existing = (process.env.PATH || '').split(':')
  return { ...process.env, PATH: [...new Set([...existing, ...extra])].join(':') }
}

function verGt(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true
    if ((pa[i] || 0) < (pb[i] || 0)) return false
  }
  return false
}

async function checkUpdate(): Promise<{
  current: string
  latest?: string
  url?: string
  hasUpdate: boolean
  error?: string
}> {
  const current = app.getVersion()
  try {
    const { stdout } = await pexec(
      'gh',
      ['release', 'view', '--repo', UPDATE_REPO, '--json', 'tagName,url'],
      { env: ghEnv() }
    )
    const j = JSON.parse(stdout)
    const latest = String(j.tagName || '').replace(/^v/, '')
    return { current, latest, url: j.url, hasUpdate: !!latest && verGt(latest, current) }
  } catch (e: any) {
    // no releases yet, gh missing, or not authed
    return { current, hasUpdate: false, error: String(e?.stderr || e?.message || e).slice(0, 200) }
  }
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
  getRunInfo,
  assistantBaseDir,
  updateMcpServer,
  deleteMcpServer,
  setMcpEnabled,
  setPluginEnabled,
  exportAssistant,
  importAssistant,
  bridgeStatus,
  linkSkills,
  unlinkSkills,
  setStorePath
} from './assistants'
import { listSessions, readSession, detectClaudeSession, detectClaudeSessions } from './claude'
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
  readTerminalLog,
  logPathFor
} from './sessions'
import { gitStatus, gitRevertFile, gitCheckpoint, gitRestoreCheckpoint, gitBranch } from './git'
import { createTerm, writeTerm, resizeTerm, killTerm, killAll, isLive, snapshot } from './pty'
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
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0d0d0f',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

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

function registerIpc(): void {
  // assistants + engines
  handle('engines:list', () => listEngines())
  handle('assistants:list', () => listAssistants())
  handle('assistant:create', (input) => createAssistant(input))
  handle('assistant:delete', (id: string, files: boolean) => deleteAssistant(id, files))
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
    return { ok: true as const, path: res.filePath }
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
    if (!dir) return [] as string[]
    const SKIP = /(^|\/)(node_modules|\.git|dist|build|\.next|out|\.turbo|coverage|\.venv|__pycache__)(\/|$)/
    const out: string[] = []
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
        if (e.isDirectory()) await walk(path.join(d, e.name), rp)
        else if (e.isFile()) out.push(rp)
      }
    }
    await walk(dir, '')
    return out.sort()
  })
  // ---- paste screenshot from clipboard → temp png path (for Claude vision) ----
  handle('clipboard:saveImage', async () => {
    const img = clipboard.readImage()
    if (img.isEmpty()) return { ok: false as const }
    const file = path.join(os.tmpdir(), `as-shot-${Date.now()}.png`)
    await fs.promises.writeFile(file, img.toPNG())
    return { ok: true as const, path: file }
  })
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
  handle('update:check', () => checkUpdate())
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
    (id: string, patch: { note?: string; tags?: string[]; pinned?: boolean }) =>
      updateSessionMeta(id, patch)
  )
  handle('termsession:delete', (id: string) => deleteSession(id))
  handle('terminal:add', async (sessionId: string, input) => {
    const t = await addTerminal(sessionId, input || {})
    return { terminal: t, logPath: logPathFor(sessionId, t.id) }
  })
  handle('terminal:rename', (sessionId: string, terminalId: string, name: string) =>
    renameTerminal(sessionId, terminalId, name)
  )
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
  handle('claude:detectMany', (cwd: string, sinceMs: number) =>
    detectClaudeSessions(cwd, sinceMs)
  )
  handle('terminal:setclaude', (sessionId: string, terminalId: string, claudeId: string) =>
    setTerminalClaude(sessionId, terminalId, claudeId)
  )
  // claude transcripts (resume history)
  handle('sessions:list', () => listSessions())
  handle('session:read', (file: string) => readSession(file))
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
          title: 'Archo güncellemesi var',
          body: `Sürüm ${r.latest} yayınlandı (şu an ${r.current}). İndirmek için tıkla.`,
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
