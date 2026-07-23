export interface ResourceItem {
  kind: 'skill' | 'agent' | 'command' | 'mcp' | 'instruction' | 'plugin' | 'settings' | 'hook'
  name: string
  path: string | null
  description?: string
  meta?: Record<string, unknown>
}

export interface SearchHit {
  path: string
  name: string
  kind: string
  matches: { line: number; text: string }[]
}

export interface ResourceGroups {
  skills: ResourceItem[]
  agents: ResourceItem[]
  commands: ResourceItem[]
  mcp: ResourceItem[]
  instructions: ResourceItem[]
  hooks: ResourceItem[]
  settings: ResourceItem[]
  plugins: ResourceItem[]
}

export interface EngineDef {
  id: string
  name: string
  icon: string
  skillsDir?: string
  agentsDir?: string
  commandsDir?: string
  mcpFile?: string
  instructionFile?: string
  runCommand: string
}

export interface Assistant {
  id: string
  name: string
  icon: string
  engineId: string
  baseDir: string
  createdAt: number
}

export interface TerminalRec {
  id: string
  name: string
  createdAt: number
  cwd?: string
  command?: string
  claudeSessionId?: string
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
  cwd?: string
  checkpoints?: { sha: string; message: string; time: number }[]
  model?: string
  effort?: string
}

export interface GitFile {
  path: string
  status: string
  untracked: boolean
  added: number
  removed: number
}
export interface GitStatus {
  isRepo: boolean
  branch?: string
  files: GitFile[]
  error?: string
}

export interface UsageBucket {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
  messages: number
}
export interface UsagePeriod {
  cost: number
  tokens: number
  messages: number
}
export interface SessionWindow {
  cost: number
  tokens: number
  messages: number
  startsAt: number
  resetsAt: number
  active: boolean
}
export interface UsageReport {
  total: UsageBucket
  today: UsagePeriod
  week: UsagePeriod
  month: UsagePeriod
  session: SessionWindow
  todayResetsAt: number
  weekResetsAt: number
  byModel: Record<string, UsageBucket>
  byDay: { date: string; cost: number; tokens: number }[]
  byProject: { project: string; cost: number; messages: number }[]
  scannedFiles: number
  generatedAt: number
}

export interface SessionMeta {
  id: string
  path: string
  project: string
  cwd: string
  mtime: number
  sizeBytes: number
  messageCount: number
  firstMessage: string
  gitBranch?: string
  version?: string
}

export interface SessionMessage {
  role: 'user' | 'assistant'
  text: string
  toolCalls: { name: string; input?: unknown }[]
  timestamp?: string
}

export interface StudioApi {
  listEngines(): Promise<EngineDef[]>
  listAssistants(): Promise<Assistant[]>
  createAssistant(input: { name: string; icon?: string; engineId: string }): Promise<Assistant>
  deleteAssistant(id: string, files: boolean): Promise<void>
  runAssistant(id: string): Promise<{ cwd: string; command: string } | null>
  exportAssistant(id: string, appState: unknown): Promise<{ ok: boolean; path?: string }>
  importAssistant(): Promise<{ ok: boolean; assistant?: Assistant; appState?: unknown }>
  listResources(assistantId: string): Promise<ResourceGroups>
  readResource(file: string): Promise<string>
  writeResource(file: string, content: string): Promise<void>
  createResource(input: {
    assistantId: string
    kind: 'skill' | 'agent' | 'command'
    name: string
    content?: string
  }): Promise<{ path: string }>
  deleteResource(file: string): Promise<void>
  duplicateResource(file: string): Promise<{ path: string }>
  searchResources(
    id: string,
    query: string,
    opts: { regex?: boolean; caseSensitive?: boolean }
  ): Promise<SearchHit[]>
  replaceInResources(
    id: string,
    query: string,
    repl: string,
    opts: { regex?: boolean; caseSensitive?: boolean; paths?: string[] }
  ): Promise<{ files: number; count: number }>
  revealResource(file: string): Promise<void>
  watchResources(assistantId: string): Promise<void>
  onResourcesChanged(cb: () => void): () => void
  testMcp(cfg: object): Promise<{
    ok: boolean
    serverName?: string
    serverVersion?: string
    tools?: { name: string; description?: string; inputSchema?: any }[]
    error?: string
    elapsedMs: number
  }>
  callMcpTool(
    cfg: object,
    tool: string,
    args: unknown
  ): Promise<{ ok: boolean; result?: unknown; error?: string; elapsedMs: number }>
  updateMcpServer(file: string, name: string, cfg: unknown): Promise<void>
  deleteMcpServer(file: string, name: string): Promise<void>
  setPluginEnabled(id: string, key: string, enabled: boolean): Promise<{ ok: boolean }>
  setMcpEnabled(id: string, name: string, enabled: boolean): Promise<{ ok: boolean }>
  getUsage(): Promise<UsageReport>
  getRealUsage(): Promise<{
    ok: boolean
    error?: string
    fiveHour?: { utilization: number; resetsAt: number }
    sevenDay?: { utilization: number; resetsAt: number }
    sevenDayOpus?: { utilization: number; resetsAt: number }
    fetchedAt: number
  }>
  listTermSessions(assistantId: string): Promise<TermSession[]>
  getTermSession(id: string): Promise<TermSession | null>
  createTermSession(assistantId: string, name: string): Promise<TermSession>
  renameTermSession(id: string, name: string): Promise<void>
  updateSessionMeta(
    id: string,
    patch: {
      note?: string
      tags?: string[]
      pinned?: boolean
      cwd?: string
      model?: string
      effort?: string
    }
  ): Promise<void>
  pickDir(defaultPath?: string): Promise<{ ok: boolean; path?: string }>
  setSessionCwd(id: string, cwd: string): Promise<void>
  gitStatus(dir: string): Promise<GitStatus>
  gitRevertFile(dir: string, file: string, untracked: boolean): Promise<void>
  gitCheckpoint(
    id: string,
    dir: string,
    message: string
  ): Promise<{ sha: string; message: string; time: number }>
  gitRestoreCheckpoint(dir: string, sha: string): Promise<void>
  removeCheckpoint(id: string, sha: string): Promise<void>
  listFiles(dir: string): Promise<string[]>
  saveClipboardImage(): Promise<{ ok: boolean; path?: string }>
  notify(
    title: string,
    body: string,
    meta?: {
      subtitle?: string
      assistantId?: string
      sessionId?: string
      terminalId?: string
      sound?: string
    }
  ): Promise<void>
  onNotifClick(
    cb: (p: { assistantId: string; sessionId: string; terminalId?: string }) => void
  ): () => void
  openExternal(url: string): Promise<void>
  gitBranch(dir: string): Promise<{ isRepo: boolean; branch?: string; dirty?: boolean }>
  bridgeStatus(dir: string): Promise<{ bridged: boolean; assistantId?: string; count?: number }>
  linkSkills(id: string, dir: string): Promise<{ ok: boolean; linked: number; error?: string }>
  unlinkSkills(dir: string): Promise<{ ok: boolean }>
  sessionUsage(
    cwd: string,
    sessionId: string
  ): Promise<{
    ok: boolean
    model?: string
    contextTokens: number
    contextWindow: number
    contextPct: number
    cost: number
    durationMs: number
    messages: number
  }>
  deleteTermSession(id: string): Promise<void>
  addTerminal(
    sessionId: string,
    input: { name?: string; cwd?: string; command?: string }
  ): Promise<{ terminal: TerminalRec; logPath: string }>
  renameTerminal(sessionId: string, terminalId: string, name: string): Promise<void>
  removeTerminal(sessionId: string, terminalId: string): Promise<void>
  readTerminalLog(sessionId: string, terminalId: string): Promise<string>
  terminalLogPath(sessionId: string, terminalId: string): Promise<string>
  terminalIsLive(id: string): Promise<boolean>
  terminalSnapshot(id: string): Promise<{ buffer: string; seq: number } | null>
  detectClaudeSession(cwd: string, sinceMs: number): Promise<string | null>
  detectClaudeSessions(cwd: string, sinceMs: number): Promise<{ id: string; mtime: number }[]>
  setTerminalClaude(sessionId: string, terminalId: string, claudeId: string): Promise<void>
  listSessions(): Promise<SessionMeta[]>
  readSession(file: string): Promise<SessionMessage[]>
  ptyCreate(id: string, opts: object): void
  ptyWrite(id: string, data: string): void
  ptyResize(id: string, cols: number, rows: number): void
  ptyKill(id: string): void
  onPtyData(cb: (id: string, data: string, seq: number) => void): () => void
  onPtyExit(cb: (id: string, code: number) => void): () => void
  onPtyBusy(cb: (id: string, busy: boolean) => void): () => void
  onPtyDone(cb: (p: { id: string; lastLine: string; durationSec: number }) => void): () => void
  findTerminal(termId: string): Promise<{
    assistantId: string
    sessionId: string
    sessionName: string
    terminalName: string
  } | null>
}

declare global {
  interface Window {
    api: StudioApi
  }
}
