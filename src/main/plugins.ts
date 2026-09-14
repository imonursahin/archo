import { execFile } from 'child_process'
import { promisify } from 'util'
import { shellEnv, shellArgv, needsShell } from './shellenv'

const pexec = promisify(execFile)

// Plugin state is Claude Code's own, not Archo's — so it is read and changed
// through the `claude plugin` CLI rather than by writing its files behind its
// back. Project-scoped plugins depend on cwd, hence every call takes one.
async function claude(cwd: string, args: string[]): Promise<string> {
  // the npm-installed CLI is claude.cmd on Windows; execFile needs a shell for it
  const { stdout } = await pexec('claude', shellArgv(args), {
    cwd,
    env: shellEnv(),
    timeout: 120000,
    maxBuffer: 1024 * 1024 * 16,
    shell: needsShell
  })
  return stdout
}

export interface PluginEntry {
  id: string
  version?: string
  scope?: string
  enabled?: boolean
  installPath?: string
  installedAt?: string
  lastUpdated?: string
  installed: boolean
}

export interface Marketplace {
  name: string
  source?: string
  repo?: string
  ref?: string
  installLocation?: string
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

export async function listPlugins(
  cwd: string
): Promise<{ ok: boolean; error?: string; installed: PluginEntry[]; available: PluginEntry[] }> {
  try {
    const [instRaw, availRaw] = await Promise.all([
      claude(cwd, ['plugin', 'list', '--json']),
      claude(cwd, ['plugin', 'list', '--available', '--json']).catch(() => '[]')
    ])
    const installed = parseJson<PluginEntry[]>(instRaw, []).map((p) => ({ ...p, installed: true }))
    const known = new Set(installed.map((p) => p.id))
    const available = parseJson<PluginEntry[]>(availRaw, [])
      .filter((p) => !known.has(p.id))
      .map((p) => ({ ...p, installed: false }))
    return { ok: true, installed, available }
  } catch (e) {
    const err = e as { stderr?: string; message?: string }
    return { ok: false, error: String(err.stderr || err.message || e), installed: [], available: [] }
  }
}

export async function listMarketplaces(cwd: string): Promise<Marketplace[]> {
  try {
    return parseJson<Marketplace[]>(await claude(cwd, ['plugin', 'marketplace', 'list', '--json']), [])
  } catch {
    return []
  }
}

async function act(cwd: string, args: string[]): Promise<{ ok: boolean; error?: string }> {
  try {
    await claude(cwd, args)
    return { ok: true }
  } catch (e) {
    const err = e as { stderr?: string; message?: string }
    return { ok: false, error: String(err.stderr || err.message || e) }
  }
}

export const pluginInstall = (cwd: string, id: string) => act(cwd, ['plugin', 'install', id])
export const pluginUninstall = (cwd: string, id: string) => act(cwd, ['plugin', 'uninstall', id])
export const pluginUpdate = (cwd: string, id: string) => act(cwd, ['plugin', 'update', id])
export const pluginEnable = (cwd: string, id: string) => act(cwd, ['plugin', 'enable', id])
export const pluginDisable = (cwd: string, id: string) => act(cwd, ['plugin', 'disable', id])
export const marketplaceAdd = (cwd: string, source: string) =>
  act(cwd, ['plugin', 'marketplace', 'add', source])
export const marketplaceRemove = (cwd: string, name: string) =>
  act(cwd, ['plugin', 'marketplace', 'remove', name])
export const marketplaceUpdate = (cwd: string, name?: string) =>
  act(cwd, name ? ['plugin', 'marketplace', 'update', name] : ['plugin', 'marketplace', 'update'])
