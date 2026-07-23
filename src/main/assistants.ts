import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { parseFrontmatter, safeReadDir, readJson, walkForFile } from './fsutil'
import { ENGINES, getEngine, type EngineDef } from './engines'

const HOME = os.homedir()
// Assistants live in a visible, runnable location.
const ASSISTANTS_ROOT = path.join(HOME, 'AgentStudio', 'assistants')
// Claude plugins are global, installed under the marketplaces dir.
const PLUGINS_DIR = path.join(HOME, '.claude', 'plugins', 'marketplaces')

export interface Assistant {
  id: string
  name: string
  icon: string
  engineId: string
  baseDir: string
  createdAt: number
}

export interface ResourceItem {
  kind: 'skill' | 'agent' | 'command' | 'mcp' | 'instruction' | 'plugin' | 'settings' | 'hook'
  name: string
  path: string | null
  description?: string
  meta?: Record<string, unknown>
}

let storePath = ''
export function setStorePath(p: string): void {
  storePath = p
}

async function loadStore(): Promise<Assistant[]> {
  const json = await readJson(storePath)
  return Array.isArray(json?.assistants) ? json.assistants : []
}
async function saveStore(list: Assistant[]): Promise<void> {
  await fs.writeFile(storePath, JSON.stringify({ assistants: list }, null, 2), 'utf8')
}

export function listEngines(): EngineDef[] {
  return ENGINES
}

export async function listAssistants(): Promise<Assistant[]> {
  return loadStore()
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function createAssistant(input: {
  name: string
  icon?: string
  engineId: string
}): Promise<Assistant> {
  const list = await loadStore()
  const slug = slugify(input.name)
  if (!slug) throw new Error('geçersiz isim')
  if (list.some((a) => a.id === slug)) throw new Error('bu isimde bir asistan zaten var')
  const engine = getEngine(input.engineId)
  const baseDir = path.join(ASSISTANTS_ROOT, slug)
  await fs.mkdir(baseDir, { recursive: true })

  // scaffold the engine's layout so it is runnable immediately
  if (engine.skillsDir) await fs.mkdir(path.join(baseDir, engine.skillsDir), { recursive: true })
  if (engine.agentsDir) await fs.mkdir(path.join(baseDir, engine.agentsDir), { recursive: true })
  if (engine.commandsDir)
    await fs.mkdir(path.join(baseDir, engine.commandsDir), { recursive: true })
  if (engine.mcpFile) {
    const mcpPath = path.join(baseDir, engine.mcpFile)
    await fs.mkdir(path.dirname(mcpPath), { recursive: true })
    if (!existsSync(mcpPath))
      await fs.writeFile(mcpPath, JSON.stringify({ mcpServers: {} }, null, 2), 'utf8')
  }
  if (engine.instructionFile) {
    const insPath = path.join(baseDir, engine.instructionFile)
    if (!existsSync(insPath))
      await fs.writeFile(
        insPath,
        `# ${input.name}\n\nBu asistanın kişiliği ve talimatları.\n`,
        'utf8'
      )
  }
  if (engine.settingsFile) {
    const setPath = path.join(baseDir, engine.settingsFile)
    await fs.mkdir(path.dirname(setPath), { recursive: true })
    if (!existsSync(setPath))
      await fs.writeFile(setPath, JSON.stringify({}, null, 2), 'utf8')
  }

  const assistant: Assistant = {
    id: slug,
    name: input.name,
    icon: input.icon || engine.icon,
    engineId: engine.id,
    baseDir,
    createdAt: Date.now()
  }
  await saveStore([...list, assistant])
  return assistant
}

// ---------- Import / Export ----------
export interface AssistantBundle {
  format: 'agent-studio/assistant'
  version: 1
  name: string
  icon: string
  engineId: string
  files: Record<string, string> // relative path -> text content
}

const BUNDLE_SKIP = /(^|\/)(node_modules|\.git|\.DS_Store)(\/|$)/
const MAX_BUNDLE_FILE = 512 * 1024 // 512KB per file cap

// ---------- Skill bridge ----------
// Make an assistant's skills/agents/commands available inside ANY working dir by
// symlinking them into <targetDir>/.claude — Claude Code only discovers these from
// the cwd tree or ~/.claude, never from the assistant folder. Reversible; entries
// are added to .git/info/exclude so they never pollute the target repo's git.
// Folder kinds under .claude/ — symlinked entry-by-entry (additive, namespaced).
const BRIDGE_KINDS = ['skills', 'agents', 'commands', 'hooks'] as const
// Single config files — symlinked whole ONLY if the target lacks its own
// (so a repo's existing config always wins and is never clobbered).
const BRIDGE_FILES: { src: string; dst: string }[] = [
  { src: '.mcp.json', dst: '.mcp.json' },
  { src: 'CLAUDE.md', dst: 'CLAUDE.md' },
  { src: '.claude/settings.json', dst: '.claude/settings.json' },
  { src: '.claude/settings.local.json', dst: '.claude/settings.local.json' }
]
const BRIDGE_MANIFEST = '.claude/.agent-studio-bridge.json'

export interface BridgeStatus {
  bridged: boolean
  assistantId?: string
  count?: number
}

export async function bridgeStatus(targetDir: string): Promise<BridgeStatus> {
  try {
    const raw = await fs.readFile(path.join(targetDir, BRIDGE_MANIFEST), 'utf8')
    const m = JSON.parse(raw)
    return { bridged: true, assistantId: m.assistantId, count: (m.linked || []).length }
  } catch {
    return { bridged: false }
  }
}

export async function linkSkills(
  id: string,
  targetDir: string
): Promise<{ ok: boolean; linked: number; error?: string }> {
  const r = await resolve(id)
  if (!r || !targetDir) return { ok: false, linked: 0, error: 'asistan/dizin yok' }
  if (path.resolve(targetDir) === path.resolve(r.a.baseDir))
    return { ok: false, linked: 0, error: 'zaten asistanın kendi dizini' }
  const baseClaude = path.join(r.a.baseDir, '.claude')
  const linked: string[] = []
  // 1) folder kinds — symlink each entry (never clobber same-named repo entries)
  for (const kind of BRIDGE_KINDS) {
    const srcDir = path.join(baseClaude, kind)
    if (!existsSync(srcDir)) continue
    const dstDir = path.join(targetDir, '.claude', kind)
    await fs.mkdir(dstDir, { recursive: true })
    for (const entry of await safeReadDir(srcDir)) {
      const src = path.join(srcDir, entry)
      const dst = path.join(dstDir, entry)
      if (existsSync(dst)) continue
      try {
        await fs.symlink(src, dst)
        linked.push(`.claude/${kind}/${entry}`)
      } catch {
        /* ignore */
      }
    }
  }
  // 2) single config files — link whole only if the repo has none of its own
  for (const { src, dst } of BRIDGE_FILES) {
    const srcPath = path.join(r.a.baseDir, src)
    if (!existsSync(srcPath)) continue
    const dstPath = path.join(targetDir, dst)
    if (existsSync(dstPath)) continue // repo's own config wins
    try {
      await fs.mkdir(path.dirname(dstPath), { recursive: true })
      await fs.symlink(srcPath, dstPath)
      linked.push(dst)
    } catch {
      /* ignore */
    }
  }
  await fs.writeFile(
    path.join(targetDir, BRIDGE_MANIFEST),
    JSON.stringify({ assistantId: id, linked, at: Date.now() }, null, 2),
    'utf8'
  )
  // keep the symlinks out of the target repo's git
  const excludeFile = path.join(targetDir, '.git', 'info', 'exclude')
  if (existsSync(path.dirname(excludeFile))) {
    const lines = [BRIDGE_MANIFEST, ...linked].map((l) => `/${l}`).join('\n')
    await fs.appendFile(excludeFile, `\n# agent-studio skill bridge\n${lines}\n`).catch(() => {})
  }
  return { ok: true, linked: linked.length }
}

export async function unlinkSkills(targetDir: string): Promise<{ ok: boolean }> {
  const manifestPath = path.join(targetDir, BRIDGE_MANIFEST)
  let m: any
  try {
    m = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  } catch {
    return { ok: false }
  }
  for (const rel of m.linked || []) {
    const p = path.join(targetDir, rel)
    try {
      const st = await fs.lstat(p)
      if (st.isSymbolicLink()) await fs.unlink(p)
    } catch {
      /* already gone */
    }
  }
  await fs.rm(manifestPath, { force: true }).catch(() => {})
  return { ok: true }
}

async function collectFiles(dir: string, rel = ''): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  let entries: import('fs').Dirent[] = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const relPath = rel ? `${rel}/${e.name}` : e.name
    if (BUNDLE_SKIP.test(relPath)) continue
    const abs = path.join(dir, e.name)
    if (e.isDirectory()) {
      Object.assign(out, await collectFiles(abs, relPath))
    } else if (e.isFile()) {
      try {
        const stat = await fs.stat(abs)
        if (stat.size > MAX_BUNDLE_FILE) continue
        out[relPath] = await fs.readFile(abs, 'utf8')
      } catch {
        /* skip unreadable/binary */
      }
    }
  }
  return out
}

export async function exportAssistant(id: string): Promise<AssistantBundle | null> {
  const r = await resolve(id)
  if (!r) return null
  const { a } = r
  return {
    format: 'agent-studio/assistant',
    version: 1,
    name: a.name,
    icon: a.icon,
    engineId: a.engineId,
    files: await collectFiles(a.baseDir)
  }
}

export async function importAssistant(bundle: AssistantBundle): Promise<Assistant> {
  if (bundle?.format !== 'agent-studio/assistant')
    throw new Error('geçersiz asistan paketi')
  const list = await loadStore()
  // pick a unique name/slug
  let name = bundle.name || 'imported'
  let slug = slugify(name)
  if (list.some((x) => x.id === slug)) {
    let n = 2
    while (list.some((x) => x.id === `${slug}-${n}`)) n++
    slug = `${slug}-${n}`
    name = `${name} (${n})`
  }
  const baseDir = path.join(ASSISTANTS_ROOT, slug)
  await fs.mkdir(baseDir, { recursive: true })
  for (const [rel, content] of Object.entries(bundle.files || {})) {
    // guard against path traversal in a malicious bundle
    const abs = path.join(baseDir, rel)
    if (!abs.startsWith(baseDir + path.sep)) continue
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, content, 'utf8')
  }
  const engine = getEngine(bundle.engineId)
  const assistant: Assistant = {
    id: slug,
    name,
    icon: bundle.icon || engine.icon,
    engineId: engine.id,
    baseDir,
    createdAt: Date.now()
  }
  await saveStore([...list, assistant])
  return assistant
}

export async function deleteAssistant(id: string, deleteFiles = false): Promise<void> {
  const list = await loadStore()
  const a = list.find((x) => x.id === id)
  await saveStore(list.filter((x) => x.id !== id))
  if (deleteFiles && a && a.baseDir.startsWith(ASSISTANTS_ROOT)) {
    await fs.rm(a.baseDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function resolve(id: string): Promise<{ a: Assistant; e: EngineDef } | null> {
  const a = (await loadStore()).find((x) => x.id === id)
  if (!a) return null
  return { a, e: getEngine(a.engineId) }
}

export async function assistantBaseDir(id: string): Promise<string | null> {
  const r = await resolve(id)
  return r?.a.baseDir ?? null
}

export async function getRunInfo(id: string): Promise<{ cwd: string; command: string } | null> {
  const r = await resolve(id)
  if (!r) return null
  return { cwd: r.a.baseDir, command: r.e.runCommand }
}

// ---------------- Resource reading ----------------
async function collectSkills(baseDir: string, e: EngineDef): Promise<ResourceItem[]> {
  if (!e.skillsDir) return []
  const root = path.join(baseDir, e.skillsDir)
  const items: ResourceItem[] = []
  for (const entry of await safeReadDir(root)) {
    if (e.skillStyle === 'dir-skillmd') {
      const skillMd = path.join(root, entry, 'SKILL.md')
      if (existsSync(skillMd)) {
        const { data } = parseFrontmatter(await fs.readFile(skillMd, 'utf8').catch(() => ''))
        items.push({ kind: 'skill', name: data.name || entry, path: skillMd, description: data.description })
      }
    } else if (/\.(md|mdc)$/.test(entry)) {
      const file = path.join(root, entry)
      const { data } = parseFrontmatter(await fs.readFile(file, 'utf8').catch(() => ''))
      items.push({
        kind: 'skill',
        name: data.name || entry.replace(/\.(md|mdc)$/, ''),
        path: file,
        description: data.description
      })
    }
  }
  return items.sort((a, b) => a.name.localeCompare(b.name))
}

async function collectFlat(
  baseDir: string,
  dir: string | undefined,
  kind: 'agent' | 'command'
): Promise<ResourceItem[]> {
  if (!dir) return []
  const root = path.join(baseDir, dir)
  const items: ResourceItem[] = []
  for (const entry of await safeReadDir(root)) {
    if (!/\.(md|mdc|toml)$/.test(entry)) continue
    const file = path.join(root, entry)
    const { data } = parseFrontmatter(await fs.readFile(file, 'utf8').catch(() => ''))
    items.push({
      kind,
      name: data.name || entry.replace(/\.(md|mdc|toml)$/, ''),
      path: file,
      description: data.description
    })
  }
  return items.sort((a, b) => a.name.localeCompare(b.name))
}

// Global (user-scope) MCP servers live in ~/.claude.json under mcpServers.
const GLOBAL_MCP_FILE = path.join(HOME, '.claude.json')

function mcpDescription(cfg: any): string {
  if (!cfg) return ''
  return cfg.command ? `${cfg.command} ${(cfg.args || []).join(' ')}`.trim() : cfg.url || ''
}

// Servers explicitly disabled for THIS assistant (never touches global config).
async function readDisabledMcp(baseDir: string, e: EngineDef): Promise<Set<string>> {
  const sp = settingsPath(baseDir, e)
  if (!sp) return new Set()
  const json = await readJson(sp)
  const arr = json?.disabledMcpjsonServers
  return new Set(Array.isArray(arr) ? arr : [])
}

async function collectMcp(baseDir: string, e: EngineDef): Promise<ResourceItem[]> {
  if (!e.mcpFile) return []
  const disabled = await readDisabledMcp(baseDir, e)
  const items: ResourceItem[] = []
  const seen = new Set<string>()

  // 1) project scope: the assistant's own .mcp.json
  const src = path.join(baseDir, e.mcpFile)
  const projJson = await readJson(src)
  for (const [name, cfg] of Object.entries<any>(projJson?.mcpServers || {})) {
    seen.add(name)
    items.push({
      kind: 'mcp',
      name,
      path: src,
      description: mcpDescription(cfg),
      meta: { ...cfg, mcpScope: 'project', mcpEnabled: !disabled.has(name) }
    })
  }

  // 2) global (user) scope: ~/.claude.json — shown read-only, toggled per assistant
  const globalJson = await readJson(GLOBAL_MCP_FILE)
  for (const [name, cfg] of Object.entries<any>(globalJson?.mcpServers || {})) {
    if (seen.has(name)) continue // a project server of the same name wins
    items.push({
      kind: 'mcp',
      name,
      path: src, // toggle writes to the assistant's settings, keyed by name
      description: mcpDescription(cfg),
      meta: { ...cfg, mcpScope: 'global', mcpEnabled: !disabled.has(name) }
    })
  }

  return items.sort((a, b) => a.name.localeCompare(b.name))
}

// Enable/disable an MCP server for THIS assistant only (edits the assistant's
// settings.json disabledMcpjsonServers — global config is never modified).
export async function setMcpEnabled(
  id: string,
  name: string,
  enabled: boolean
): Promise<{ ok: boolean }> {
  const r = await resolve(id)
  if (!r) return { ok: false }
  const sp = settingsPath(r.a.baseDir, r.e)
  if (!sp) return { ok: false }
  const json = (await readJson(sp)) || {}
  const list: string[] = Array.isArray(json.disabledMcpjsonServers)
    ? json.disabledMcpjsonServers
    : []
  const set = new Set(list)
  if (enabled) set.delete(name)
  else set.add(name)
  if (set.size > 0) json.disabledMcpjsonServers = [...set]
  else delete json.disabledMcpjsonServers
  await fs.mkdir(path.dirname(sp), { recursive: true })
  await fs.writeFile(sp, JSON.stringify(json, null, 2), 'utf8')
  return { ok: true }
}

// Claude plugins are global (installed marketplaces), shown for claude engine.
// Enablement lives in the assistant's .claude/settings.json under
// enabledPlugins: { "<name>@<marketplace>": boolean }. Absent = enabled by default.
async function collectPlugins(baseDir: string, e: EngineDef): Promise<ResourceItem[]> {
  if (e.id !== 'claude') return []
  const files = await walkForFile(PLUGINS_DIR, 'plugin.json', 5)
  const enabledMap = await readEnabledPlugins(baseDir, e)
  const items: ResourceItem[] = []
  const seen = new Set<string>()
  for (const f of files) {
    const json = await readJson(f)
    if (!json?.name || seen.has(json.name)) continue
    seen.add(json.name)
    const m = f.match(/\/marketplaces\/([^/]+)\//)
    const marketplace = m?.[1] || ''
    const key = `${json.name}@${marketplace.toLowerCase()}`
    const enabled = enabledMap[key] !== false // default: enabled
    items.push({
      kind: 'plugin',
      name: json.name,
      path: f,
      description: json.description,
      meta: { marketplace, key, enabled }
    })
  }
  return items.sort((a, b) => a.name.localeCompare(b.name))
}

function settingsPath(baseDir: string, e: EngineDef): string | null {
  return e.settingsFile ? path.join(baseDir, e.settingsFile) : null
}

async function readEnabledPlugins(
  baseDir: string,
  e: EngineDef
): Promise<Record<string, boolean>> {
  const sp = settingsPath(baseDir, e)
  if (!sp) return {}
  const json = await readJson(sp)
  const ep = json?.enabledPlugins
  return ep && typeof ep === 'object' ? (ep as Record<string, boolean>) : {}
}

// Toggle a plugin on/off in the assistant's settings.json.
export async function setPluginEnabled(
  id: string,
  key: string,
  enabled: boolean
): Promise<{ ok: boolean }> {
  const r = await resolve(id)
  if (!r) return { ok: false }
  const sp = settingsPath(r.a.baseDir, r.e)
  if (!sp) return { ok: false }
  const json = (await readJson(sp)) || {}
  const ep: Record<string, boolean> =
    json.enabledPlugins && typeof json.enabledPlugins === 'object' ? json.enabledPlugins : {}
  if (enabled) {
    // enabled is the default; drop the explicit-disable entry to keep settings clean
    delete ep[key]
  } else {
    ep[key] = false
  }
  if (Object.keys(ep).length > 0) json.enabledPlugins = ep
  else delete json.enabledPlugins
  await fs.mkdir(path.dirname(sp), { recursive: true })
  await fs.writeFile(sp, JSON.stringify(json, null, 2), 'utf8')
  return { ok: true }
}

async function collectInstruction(baseDir: string, e: EngineDef): Promise<ResourceItem[]> {
  if (!e.instructionFile) return []
  const file = path.join(baseDir, e.instructionFile)
  if (!existsSync(file)) return []
  return [{ kind: 'instruction', name: e.instructionFile, path: file }]
}

async function collectHooks(baseDir: string, e: EngineDef): Promise<ResourceItem[]> {
  if (!e.settingsFile) return []
  const dir = path.dirname(path.join(baseDir, e.settingsFile))
  const base = path.basename(e.settingsFile).replace(/\.json$/, '')
  const items: ResourceItem[] = []
  const seen = new Set<string>()
  for (const name of [`${base}.json`, `${base}.local.json`]) {
    const file = path.join(dir, name)
    const json = await readJson(file)
    const hooks = json?.hooks
    if (!hooks || typeof hooks !== 'object') continue
    for (const event of Object.keys(hooks)) {
      if (seen.has(event)) continue
      seen.add(event)
      const count = Array.isArray(hooks[event]) ? hooks[event].length : 0
      items.push({
        kind: 'hook',
        name: event,
        path: file,
        description: `${count} matcher · ${name}`,
        meta: hooks[event]
      })
    }
  }
  return items
}

async function collectSettings(baseDir: string, e: EngineDef): Promise<ResourceItem[]> {
  if (!e.settingsFile) return []
  const items: ResourceItem[] = []
  const dir = path.dirname(path.join(baseDir, e.settingsFile))
  const base = path.basename(e.settingsFile).replace(/\.json$/, '')
  for (const name of [`${base}.json`, `${base}.local.json`]) {
    const file = path.join(dir, name)
    if (existsSync(file)) items.push({ kind: 'settings', name, path: file })
  }
  return items
}

export async function getResources(id: string) {
  const r = await resolve(id)
  if (!r)
    return {
      skills: [],
      agents: [],
      commands: [],
      mcp: [],
      instructions: [],
      hooks: [],
      settings: [],
      plugins: []
    }
  const { a, e } = r
  const [skills, agents, commands, mcp, instructions, hooks, settings, plugins] =
    await Promise.all([
      collectSkills(a.baseDir, e),
      collectFlat(a.baseDir, e.agentsDir, 'agent'),
      collectFlat(a.baseDir, e.commandsDir, 'command'),
      collectMcp(a.baseDir, e),
      collectInstruction(a.baseDir, e),
      collectHooks(a.baseDir, e),
      collectSettings(a.baseDir, e),
      collectPlugins(a.baseDir, e)
    ])
  return { skills, agents, commands, mcp, instructions, hooks, settings, plugins }
}

export async function readResourceFile(file: string): Promise<string> {
  return fs.readFile(file, 'utf8')
}

// ---------- Cross-resource find & replace ----------
export interface SearchMatch {
  line: number
  text: string
}
export interface SearchHit {
  path: string
  name: string
  kind: string
  matches: SearchMatch[]
}
interface SearchOpts {
  regex?: boolean
  caseSensitive?: boolean
}

function buildMatcher(query: string, opts: SearchOpts): RegExp | null {
  if (!query) return null
  const flags = opts.caseSensitive ? 'g' : 'gi'
  const src = opts.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    return new RegExp(src, flags)
  } catch {
    return null
  }
}

// Text resources worth searching (plugins are global/read-only, MCP dedupes by file).
async function searchableFiles(id: string): Promise<{ path: string; name: string; kind: string }[]> {
  const res = await getResources(id)
  const groups = [res.skills, res.agents, res.commands, res.instructions, res.settings, res.hooks]
  const seen = new Set<string>()
  const out: { path: string; name: string; kind: string }[] = []
  for (const g of groups)
    for (const it of g) {
      if (!it.path || seen.has(it.path) || !existsSync(it.path)) continue
      seen.add(it.path)
      out.push({ path: it.path, name: it.name, kind: it.kind })
    }
  return out
}

export async function searchResources(
  id: string,
  query: string,
  opts: SearchOpts = {}
): Promise<SearchHit[]> {
  const re = buildMatcher(query, opts)
  if (!re) return []
  const files = await searchableFiles(id)
  const hits: SearchHit[] = []
  for (const f of files) {
    let content: string
    try {
      content = await fs.readFile(f.path, 'utf8')
    } catch {
      continue
    }
    const matches: SearchMatch[] = []
    content.split('\n').forEach((text, i) => {
      re.lastIndex = 0
      if (re.test(text)) matches.push({ line: i + 1, text: text.trim().slice(0, 240) })
    })
    if (matches.length) hits.push({ path: f.path, name: f.name, kind: f.kind, matches })
  }
  return hits
}

export async function replaceInResources(
  id: string,
  query: string,
  replacement: string,
  opts: SearchOpts & { paths?: string[] } = {}
): Promise<{ files: number; count: number }> {
  if (!query) return { files: 0, count: 0 }
  const files = await searchableFiles(id)
  const only = opts.paths ? new Set(opts.paths) : null
  let filesChanged = 0
  let count = 0
  for (const f of files) {
    if (only && !only.has(f.path)) continue
    let content: string
    try {
      content = await fs.readFile(f.path, 'utf8')
    } catch {
      continue
    }
    const re = buildMatcher(query, opts)
    if (!re) break
    const found = content.match(re)
    if (!found || found.length === 0) continue
    const next = content.replace(re, replacement)
    if (next !== content) {
      await fs.writeFile(f.path, next, 'utf8')
      filesChanged++
      count += found.length
    }
  }
  return { files: filesChanged, count }
}

// delete a resource file. For dir-style skills (…/<name>/SKILL.md) remove the
// whole skill folder; otherwise remove the single file.
export async function deleteResourceFile(file: string): Promise<void> {
  if (!file) return
  if (file.endsWith('/SKILL.md') || file.endsWith('\\SKILL.md')) {
    await fs.rm(path.dirname(file), { recursive: true, force: true }).catch(() => {})
  } else {
    await fs.rm(file, { force: true }).catch(() => {})
  }
}

// duplicate a resource; returns the new file path
export async function duplicateResourceFile(file: string): Promise<{ path: string }> {
  if (file.endsWith('SKILL.md')) {
    const dir = path.dirname(file)
    const parent = path.dirname(dir)
    let base = path.basename(dir) + '-copy'
    let target = path.join(parent, base)
    let i = 2
    while (existsSync(target)) target = path.join(parent, `${base}-${i++}`)
    await fs.cp(dir, target, { recursive: true })
    return { path: path.join(target, 'SKILL.md') }
  }
  const ext = path.extname(file)
  const stem = file.slice(0, -ext.length)
  let target = `${stem}-copy${ext}`
  let i = 2
  while (existsSync(target)) target = `${stem}-copy-${i++}${ext}`
  await fs.copyFile(file, target)
  return { path: target }
}

// update (or add) a single MCP server entry inside an .mcp.json-style file
export async function updateMcpServer(file: string, name: string, cfg: unknown): Promise<void> {
  const json = (await readJson(file)) || {}
  if (!json.mcpServers) json.mcpServers = {}
  json.mcpServers[name] = cfg
  await fs.writeFile(file, JSON.stringify(json, null, 2), 'utf8')
}

// remove every trace of an MCP server: the .mcp.json entry AND all references
// in settings.json / settings.local.json (enabled lists + mcp__<name>__ perms).
export async function deleteMcpServer(file: string, name: string): Promise<void> {
  const json = (await readJson(file)) || {}
  if (json.mcpServers && name in json.mcpServers) {
    delete json.mcpServers[name]
    await fs.writeFile(file, JSON.stringify(json, null, 2), 'utf8')
  }
  const baseDir = path.dirname(file)
  const settingsFiles = [
    path.join(baseDir, '.claude', 'settings.json'),
    path.join(baseDir, '.claude', 'settings.local.json'),
    path.join(baseDir, 'settings.json'),
    path.join(baseDir, 'settings.local.json')
  ]
  const permPrefix = `mcp__${name}__`
  const permExact = `mcp__${name}`
  for (const sf of settingsFiles) {
    const s = await readJson(sf)
    if (!s || typeof s !== 'object') continue
    let changed = false
    // enabled/disabled server arrays
    for (const key of [
      'enabledMcpjsonServers',
      'disabledMcpjsonServers',
      'enabledMcpServers',
      'disabledMcpServers'
    ]) {
      if (Array.isArray(s[key]) && s[key].includes(name)) {
        s[key] = s[key].filter((x: string) => x !== name)
        changed = true
      }
    }
    // permission lists (allow/deny/ask) referencing this server's tools
    const perms = s.permissions
    if (perms && typeof perms === 'object') {
      for (const list of ['allow', 'deny', 'ask']) {
        if (Array.isArray(perms[list])) {
          const before = perms[list].length
          perms[list] = perms[list].filter(
            (p: string) => !(p.startsWith(permPrefix) || p === permExact)
          )
          if (perms[list].length !== before) changed = true
        }
      }
    }
    if (changed) await fs.writeFile(sf, JSON.stringify(s, null, 2), 'utf8')
  }
}
export async function writeResourceFile(file: string, content: string): Promise<void> {
  await fs.writeFile(file, content, 'utf8')
}

// ---------------- Create resource inside an assistant ----------------
const TEMPLATES = {
  skill: (n: string) =>
    `---\nname: ${n}\ndescription: TODO — bu skill ne zaman kullanılır\n---\n# ${n}\n\nTalimatlar…\n`,
  agent: (n: string) =>
    `---\nname: ${n}\ndescription: TODO — bu agent ne yapar\ntools: Read, Grep, Glob\nmodel: inherit\n---\nSen bir ${n} agent'ısın. Görevin…\n`,
  command: (n: string) =>
    `---\ndescription: TODO — bu komut ne yapar\n---\n# /${n}\n\n$ARGUMENTS ile talimat…\n`
}

export async function createResource(input: {
  assistantId: string
  kind: 'skill' | 'agent' | 'command'
  name: string
  content?: string
}): Promise<{ path: string }> {
  const r = await resolve(input.assistantId)
  if (!r) throw new Error('asistan bulunamadı')
  const { a, e } = r
  const safe = input.name.trim().replace(/[^a-zA-Z0-9._-]/g, '-')
  if (!safe) throw new Error('geçersiz isim')

  let file: string
  if (input.kind === 'skill') {
    if (!e.skillsDir) throw new Error(`${e.name} skill desteklemiyor`)
    if (e.skillStyle === 'dir-skillmd') {
      const dir = path.join(a.baseDir, e.skillsDir, safe)
      await fs.mkdir(dir, { recursive: true })
      file = path.join(dir, 'SKILL.md')
    } else {
      await fs.mkdir(path.join(a.baseDir, e.skillsDir), { recursive: true })
      file = path.join(a.baseDir, e.skillsDir, `${safe}.mdc`)
    }
  } else {
    const dir = input.kind === 'agent' ? e.agentsDir : e.commandsDir
    if (!dir) throw new Error(`${e.name} ${input.kind} desteklemiyor`)
    const ext = input.kind === 'command' ? e.commandExt : '.md'
    await fs.mkdir(path.join(a.baseDir, dir), { recursive: true })
    file = path.join(a.baseDir, dir, `${safe}${ext}`)
  }
  if (existsSync(file)) throw new Error('bu isimde bir kaynak zaten var')
  await fs.writeFile(file, input.content ?? TEMPLATES[input.kind](safe), 'utf8')
  return { path: file }
}
