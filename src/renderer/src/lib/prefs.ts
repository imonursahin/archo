// User preferences + favorites, persisted in localStorage.

export interface Prefs {
  notifications: boolean // toast bildirimleri
  usageAlerts: boolean // oturum limiti uyarıları
  confirmDelete: boolean // silmeden önce onay iste
  notifyOnDone: boolean // uzun görev bitince masaüstü bildirimi
  notifyThreshold: number // kaç saniyeden uzun sürerse bildir
  meetingAlerts: boolean // toplantıdan 5 dk önce masaüstü bildirimi
}

const DEFAULTS: Prefs = {
  notifications: true,
  usageAlerts: true,
  confirmDelete: true,
  notifyOnDone: true,
  notifyThreshold: 20,
  meetingAlerts: true
}

const KEY = 'prefs'

export function getPrefs(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  const next = { ...getPrefs(), [key]: value }
  localStorage.setItem(KEY, JSON.stringify(next))
}

// ---------- Favorites (by resource path) ----------
const FAV_KEY = 'favorites'

export function getFavorites(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

export function isFavorite(path: string): boolean {
  return getFavorites().has(path)
}

export function toggleFavorite(path: string): boolean {
  const favs = getFavorites()
  if (favs.has(path)) favs.delete(path)
  else favs.add(path)
  localStorage.setItem(FAV_KEY, JSON.stringify([...favs]))
  return favs.has(path)
}

// ---------- Recent working dirs (per assistant) ----------
export function getRecentDirs(assistantId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(`recentdirs:${assistantId}`) || '[]')
  } catch {
    return []
  }
}
export function pushRecentDir(assistantId: string, dir: string): void {
  if (!dir) return
  const list = [dir, ...getRecentDirs(assistantId).filter((d) => d !== dir)].slice(0, 8)
  localStorage.setItem(`recentdirs:${assistantId}`, JSON.stringify(list))
}
export function removeRecentDir(assistantId: string, dir: string): void {
  const list = getRecentDirs(assistantId).filter((d) => d !== dir)
  localStorage.setItem(`recentdirs:${assistantId}`, JSON.stringify(list))
}

// ---------- App-state bundle (for assistant export/import) ----------
const GROUP_KEYS = [
  'skills',
  'agents',
  'commands',
  'mcp',
  'plugins',
  'instructions',
  'hooks',
  'settings'
]

export interface AppStateBundle {
  prompts: SavedPrompt[]
  favorites: string[] // relative to the assistant baseDir
  order: Record<string, string[]> // group -> relative paths
  folders?: Record<string, { names: string[]; of: Record<string, string> }> // group -> folders, paths relative
  prefs?: Prefs // global app preferences (notifications, confirmDelete…)
  theme?: string // 'dark' | 'light'
  lang?: string // 'en' | 'tr'
}

// Gather this assistant's app-level settings, with file paths made relative so
// they survive an import into a different baseDir. Also carries the global app
// settings (prefs/theme/lang) so an import fully recreates the environment.
export function exportAppState(baseDir: string, assistantId: string): AppStateBundle {
  const prefix = baseDir.replace(/\/$/, '') + '/'
  const rel = (p: string): string | null => (p.startsWith(prefix) ? p.slice(prefix.length) : null)
  const favorites = [...getFavorites()].map(rel).filter((x): x is string => !!x)
  const order: Record<string, string[]> = {}
  for (const g of GROUP_KEYS) {
    const o = getOrder(assistantId, g).map(rel).filter((x): x is string => !!x)
    if (o.length) order[g] = o
  }
  const folders: AppStateBundle['folders'] = {}
  for (const g of GROUP_KEYS) {
    const s = getFolders(assistantId, g)
    const of: Record<string, string> = {}
    for (const [p, f] of Object.entries(s.of)) {
      const r = rel(p)
      if (r) of[r] = f
    }
    if (s.names.length) folders[g] = { names: s.names, of }
  }
  return {
    prompts: getPrompts(),
    favorites,
    order,
    folders,
    prefs: getPrefs(),
    theme: localStorage.getItem('theme') || 'dark',
    lang: localStorage.getItem('lang') || 'en'
  }
}

// Restore an imported bundle onto a new assistant (re-absolutizing paths).
export function importAppState(
  baseDir: string,
  assistantId: string,
  state: AppStateBundle | null | undefined
): void {
  if (!state) return
  const prefix = baseDir.replace(/\/$/, '') + '/'
  if (state.favorites?.length) {
    const favs = getFavorites()
    for (const r of state.favorites) favs.add(prefix + r)
    localStorage.setItem(FAV_KEY, JSON.stringify([...favs]))
  }
  if (state.order) {
    for (const [g, arr] of Object.entries(state.order))
      setOrder(assistantId, g, arr.map((r) => prefix + r))
  }
  if (state.folders) {
    for (const [g, f] of Object.entries(state.folders)) {
      const of: Record<string, string> = {}
      for (const [r, name] of Object.entries(f.of || {})) of[prefix + r] = name
      setFolders(assistantId, g, { names: f.names || [], of })
    }
  }
  if (state.prompts?.length) {
    const existing = getPrompts()
    const ids = new Set(existing.map((p) => p.id))
    savePrompts([...existing, ...state.prompts.filter((p) => !ids.has(p.id))])
  }
  // global app settings — recreate the environment
  if (state.prefs) localStorage.setItem(KEY, JSON.stringify({ ...DEFAULTS, ...state.prefs }))
  if (state.theme) localStorage.setItem('theme', state.theme)
  if (state.lang) localStorage.setItem('lang', state.lang)
}

// ---------- Prompt library ----------
export interface SavedPrompt {
  id: string
  title: string
  text: string
}
const PROMPT_KEY = 'prompts'
// no preloaded prompts — the library starts empty; user adds their own
const DEFAULT_PROMPTS: SavedPrompt[] = []

export function getPrompts(): SavedPrompt[] {
  try {
    const raw = localStorage.getItem(PROMPT_KEY)
    if (!raw) return DEFAULT_PROMPTS
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : DEFAULT_PROMPTS
  } catch {
    return DEFAULT_PROMPTS
  }
}
export function savePrompts(list: SavedPrompt[]): void {
  localStorage.setItem(PROMPT_KEY, JSON.stringify(list))
}

// ---------- Custom sidebar ordering (per assistant + group) ----------
function orderKey(assistantId: string, group: string): string {
  return `order:${assistantId}:${group}`
}

export function getOrder(assistantId: string, group: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(orderKey(assistantId, group)) || '[]')
  } catch {
    return []
  }
}

export function setOrder(assistantId: string, group: string, paths: string[]): void {
  localStorage.setItem(orderKey(assistantId, group), JSON.stringify(paths))
}

// ---------- Sidebar folders (per assistant + group) ----------
// Claude Code finds agents and commands only as flat files, and a skill only at
// `.claude/skills/<name>/SKILL.md` — moving any of them into a subfolder makes
// it silently invisible. So a folder is Archo's own grouping: the files stay
// where Claude expects them and only this record says what belongs together.
export interface FolderState {
  names: string[] // folders in display order, including empty ones
  of: Record<string, string> // resource path -> folder name
}

function folderKey(assistantId: string, group: string): string {
  return `folders:${assistantId}:${group}`
}

export function getFolders(assistantId: string, group: string): FolderState {
  try {
    const raw = JSON.parse(localStorage.getItem(folderKey(assistantId, group)) || '{}')
    return { names: Array.isArray(raw.names) ? raw.names : [], of: raw.of || {} }
  } catch {
    return { names: [], of: {} }
  }
}

export function setFolders(assistantId: string, group: string, state: FolderState): void {
  localStorage.setItem(folderKey(assistantId, group), JSON.stringify(state))
}

export function addFolder(assistantId: string, group: string, name: string): void {
  const s = getFolders(assistantId, group)
  const clean = name.trim()
  if (!clean || s.names.includes(clean)) return
  setFolders(assistantId, group, { ...s, names: [...s.names, clean] })
}

export function removeFolder(assistantId: string, group: string, name: string): void {
  const s = getFolders(assistantId, group)
  const of = { ...s.of }
  // the resources come back out to the top level; nothing on disk moves
  for (const [p, f] of Object.entries(of)) if (f === name) delete of[p]
  setFolders(assistantId, group, { names: s.names.filter((n) => n !== name), of })
}

// folder = null takes the resource out of every folder
export function assignFolder(
  assistantId: string,
  group: string,
  path: string,
  folder: string | null
): void {
  const s = getFolders(assistantId, group)
  const of = { ...s.of }
  if (folder) of[path] = folder
  else delete of[path]
  setFolders(assistantId, group, { ...s, of })
}

// Paths come from the main process, so they carry the platform's own separator.
function isUnder(dir: string, p: string): boolean {
  return p.startsWith(dir + '/') || p.startsWith(dir + '\\')
}

// A deleted file is gone from disk, so every reference the app still holds to it
// is dead weight — favorites and the saved sidebar order both key on the path.
export function forgetResource(assistantId: string, path: string): void {
  const favs = getFavorites()
  if (favs.delete(path)) localStorage.setItem(FAV_KEY, JSON.stringify([...favs]))
  for (const group of GROUP_KEYS) {
    const folders = getFolders(assistantId, group)
    const of = { ...folders.of }
    let touched = false
    for (const p of Object.keys(of))
      if (p === path || isUnder(path, p)) {
        delete of[p]
        touched = true
      }
    if (touched) setFolders(assistantId, group, { ...folders, of })
    const list = getOrder(assistantId, group)
    // a deleted skill takes its whole folder, so drop anything under it too
    const kept = list.filter((p) => p !== path && !isUnder(path, p))
    if (kept.length !== list.length) setOrder(assistantId, group, kept)
  }
}

// Same, for a whole assistant: its ordering, recent dirs and any favorite that
// lived inside its folder.
export function forgetAssistant(assistantId: string, baseDir: string): void {
  for (const group of GROUP_KEYS) {
    localStorage.removeItem(orderKey(assistantId, group))
    localStorage.removeItem(folderKey(assistantId, group))
  }
  localStorage.removeItem(`recentdirs:${assistantId}`)
  const favs = getFavorites()
  const kept = [...favs].filter((p) => !isUnder(baseDir, p))
  if (kept.length !== favs.size) localStorage.setItem(FAV_KEY, JSON.stringify(kept))
}

// Sort items by the saved order; unknown (new) items keep their natural order at
// the end. A file that belongs to a resource is ranked with that resource, or a
// saved order would sink every one of them to the bottom of the group.
export function applyOrder<T extends { path: string | null; meta?: Record<string, unknown> }>(
  items: T[],
  assistantId: string,
  group: string
): T[] {
  const order = getOrder(assistantId, group)
  if (order.length === 0) return items
  const rank = new Map(order.map((p, i) => [p, i]))
  const rankOf = (i: T): number => {
    const own = (i.meta?.under as string) || i.path || ''
    return rank.has(own) ? rank.get(own)! : Infinity
  }
  return [...items].sort((a, b) => rankOf(a) - rankOf(b))
}
