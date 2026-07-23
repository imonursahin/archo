import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // engines + assistants
  listEngines: () => ipcRenderer.invoke('engines:list'),
  listAssistants: () => ipcRenderer.invoke('assistants:list'),
  createAssistant: (input: object) => ipcRenderer.invoke('assistant:create', input),
  deleteAssistant: (id: string, files: boolean) =>
    ipcRenderer.invoke('assistant:delete', id, files),
  runAssistant: (id: string) => ipcRenderer.invoke('assistant:run', id),
  exportAssistant: (id: string, appState: unknown) =>
    ipcRenderer.invoke('assistant:export', id, appState),
  importAssistant: () => ipcRenderer.invoke('assistant:import'),
  // resources
  listResources: (assistantId: string) => ipcRenderer.invoke('resources:list', assistantId),
  readResource: (file: string) => ipcRenderer.invoke('resource:read', file),
  writeResource: (file: string, content: string) =>
    ipcRenderer.invoke('resource:write', file, content),
  createResource: (input: object) => ipcRenderer.invoke('resource:create', input),
  deleteResource: (file: string) => ipcRenderer.invoke('resource:delete', file),
  duplicateResource: (file: string) => ipcRenderer.invoke('resource:duplicate', file),
  searchResources: (id: string, query: string, opts: unknown) =>
    ipcRenderer.invoke('resource:search', id, query, opts),
  replaceInResources: (id: string, query: string, repl: string, opts: unknown) =>
    ipcRenderer.invoke('resource:replace', id, query, repl, opts),
  revealResource: (file: string) => ipcRenderer.invoke('resource:reveal', file),
  watchResources: (assistantId: string) => ipcRenderer.invoke('resources:watch', assistantId),
  testMcp: (cfg: object) => ipcRenderer.invoke('mcp:test', cfg),
  callMcpTool: (cfg: object, tool: string, args: unknown) =>
    ipcRenderer.invoke('mcp:call', cfg, tool, args),
  getUsage: () => ipcRenderer.invoke('usage:get'),
  getRealUsage: () => ipcRenderer.invoke('usage:real'),
  updateMcpServer: (file: string, name: string, cfg: unknown) =>
    ipcRenderer.invoke('mcp:update', file, name, cfg),
  deleteMcpServer: (file: string, name: string) =>
    ipcRenderer.invoke('mcp:delete', file, name),
  setPluginEnabled: (id: string, key: string, enabled: boolean) =>
    ipcRenderer.invoke('plugin:setEnabled', id, key, enabled),
  setMcpEnabled: (id: string, name: string, enabled: boolean) =>
    ipcRenderer.invoke('mcp:setEnabled', id, name, enabled),
  onResourcesChanged: (cb: () => void) => {
    const h = (): void => cb()
    ipcRenderer.on('resources:changed', h)
    return () => ipcRenderer.removeListener('resources:changed', h)
  },
  // terminal sessions (cmux-style)
  listTermSessions: (assistantId: string) =>
    ipcRenderer.invoke('termsessions:list', assistantId),
  getTermSession: (id: string) => ipcRenderer.invoke('termsession:get', id),
  createTermSession: (assistantId: string, name: string) =>
    ipcRenderer.invoke('termsession:create', assistantId, name),
  renameTermSession: (id: string, name: string) =>
    ipcRenderer.invoke('termsession:rename', id, name),
  updateSessionMeta: (
    id: string,
    patch: { note?: string; tags?: string[]; pinned?: boolean; cwd?: string }
  ) => ipcRenderer.invoke('termsession:meta', id, patch),
  pickDir: (defaultPath?: string) => ipcRenderer.invoke('dir:pick', defaultPath),
  setSessionCwd: (id: string, cwd: string) => ipcRenderer.invoke('session:setCwd', id, cwd),
  gitStatus: (dir: string) => ipcRenderer.invoke('git:status', dir),
  gitRevertFile: (dir: string, file: string, untracked: boolean) =>
    ipcRenderer.invoke('git:revertFile', dir, file, untracked),
  gitCheckpoint: (id: string, dir: string, message: string) =>
    ipcRenderer.invoke('git:checkpoint', id, dir, message),
  gitRestoreCheckpoint: (dir: string, sha: string) =>
    ipcRenderer.invoke('git:restoreCheckpoint', dir, sha),
  removeCheckpoint: (id: string, sha: string) =>
    ipcRenderer.invoke('session:removeCheckpoint', id, sha),
  listFiles: (dir: string) => ipcRenderer.invoke('fs:listFiles', dir),
  saveClipboardImage: () => ipcRenderer.invoke('clipboard:saveImage'),
  notify: (title: string, body: string, meta?: object) =>
    ipcRenderer.invoke('notify', title, body, meta),
  onNotifClick: (
    cb: (p: { assistantId: string; sessionId: string; terminalId?: string }) => void
  ) => {
    const h = (
      _e: unknown,
      p: { assistantId: string; sessionId: string; terminalId?: string }
    ): void => cb(p)
    ipcRenderer.on('notif:click', h)
    return () => ipcRenderer.removeListener('notif:click', h)
  },
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  gitBranch: (dir: string) => ipcRenderer.invoke('git:branch', dir),
  sessionUsage: (cwd: string, sessionId: string) =>
    ipcRenderer.invoke('session:usage', cwd, sessionId),
  bridgeStatus: (dir: string) => ipcRenderer.invoke('bridge:status', dir),
  linkSkills: (id: string, dir: string) => ipcRenderer.invoke('bridge:link', id, dir),
  unlinkSkills: (dir: string) => ipcRenderer.invoke('bridge:unlink', dir),
  deleteTermSession: (id: string) => ipcRenderer.invoke('termsession:delete', id),
  addTerminal: (sessionId: string, input: object) =>
    ipcRenderer.invoke('terminal:add', sessionId, input),
  renameTerminal: (sessionId: string, terminalId: string, name: string) =>
    ipcRenderer.invoke('terminal:rename', sessionId, terminalId, name),
  removeTerminal: (sessionId: string, terminalId: string) =>
    ipcRenderer.invoke('terminal:remove', sessionId, terminalId),
  readTerminalLog: (sessionId: string, terminalId: string) =>
    ipcRenderer.invoke('terminal:log', sessionId, terminalId),
  terminalLogPath: (sessionId: string, terminalId: string) =>
    ipcRenderer.invoke('terminal:logpath', sessionId, terminalId),
  terminalIsLive: (id: string) => ipcRenderer.invoke('terminal:islive', id),
  terminalSnapshot: (id: string) => ipcRenderer.invoke('terminal:snapshot', id),
  detectClaudeSession: (cwd: string, sinceMs: number) =>
    ipcRenderer.invoke('claude:detect', cwd, sinceMs),
  detectClaudeSessions: (cwd: string, sinceMs: number) =>
    ipcRenderer.invoke('claude:detectMany', cwd, sinceMs),
  markTerminalRanClaude: (sessionId: string, terminalId: string) =>
    ipcRenderer.invoke('terminal:ranclaude', sessionId, terminalId),
  setTerminalClaude: (sessionId: string, terminalId: string, claudeId: string) =>
    ipcRenderer.invoke('terminal:setclaude', sessionId, terminalId, claudeId),
  // claude transcripts
  listSessions: () => ipcRenderer.invoke('sessions:list'),
  readSession: (file: string) => ipcRenderer.invoke('session:read', file),
  // pty
  ptyCreate: (id: string, opts: object) => ipcRenderer.send('pty:create', id, opts),
  ptyWrite: (id: string, data: string) => ipcRenderer.send('pty:write', id, data),
  ptyResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.send('pty:resize', id, cols, rows),
  ptyKill: (id: string) => ipcRenderer.send('pty:kill', id),
  onPtyData: (cb: (id: string, data: string, seq: number) => void) => {
    const h = (_e: unknown, p: { id: string; data: string; seq: number }) =>
      cb(p.id, p.data, p.seq)
    ipcRenderer.on('pty:data', h)
    return () => ipcRenderer.removeListener('pty:data', h)
  },
  onPtyExit: (cb: (id: string, code: number) => void) => {
    const h = (_e: unknown, p: { id: string; exitCode: number }) => cb(p.id, p.exitCode)
    ipcRenderer.on('pty:exit', h)
    return () => ipcRenderer.removeListener('pty:exit', h)
  },
  // busy/idle (spinner) + task-done (notification), detected in main
  onPtyBusy: (cb: (id: string, busy: boolean) => void) => {
    const h = (_e: unknown, p: { id: string; busy: boolean }) => cb(p.id, p.busy)
    ipcRenderer.on('pty:busy', h)
    return () => ipcRenderer.removeListener('pty:busy', h)
  },
  onPtyDone: (cb: (p: { id: string; lastLine: string; durationSec: number }) => void) => {
    const h = (_e: unknown, p: { id: string; lastLine: string; durationSec: number }) => cb(p)
    ipcRenderer.on('pty:done', h)
    return () => ipcRenderer.removeListener('pty:done', h)
  },
  findTerminal: (termId: string) => ipcRenderer.invoke('term:find', termId),
  checkUpdate: () => ipcRenderer.invoke('update:check')
}

contextBridge.exposeInMainWorld('api', api)

export type StudioApi = typeof api
