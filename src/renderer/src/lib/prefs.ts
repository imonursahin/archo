// User preferences + favorites, persisted in localStorage.

export interface Prefs {
  notifications: boolean // toast bildirimleri
  usageAlerts: boolean // oturum limiti uyarıları
  confirmDelete: boolean // silmeden önce onay iste
  notifyOnDone: boolean // uzun görev bitince masaüstü bildirimi
  notifyThreshold: number // kaç saniyeden uzun sürerse bildir
}

const DEFAULTS: Prefs = {
  notifications: true,
  usageAlerts: true,
  confirmDelete: true,
  notifyOnDone: true,
  notifyThreshold: 20
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
  return {
    prompts: getPrompts(),
    favorites,
    order,
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

// Sort items by the saved order; unknown (new) items keep their natural order at the end.
export function applyOrder<T extends { path: string | null }>(
  items: T[],
  assistantId: string,
  group: string
): T[] {
  const order = getOrder(assistantId, group)
  if (order.length === 0) return items
  const rank = new Map(order.map((p, i) => [p, i]))
  return [...items].sort((a, b) => {
    const ra = rank.has(a.path || '') ? rank.get(a.path || '')! : Infinity
    const rb = rank.has(b.path || '') ? rank.get(b.path || '')! : Infinity
    return ra - rb
  })
}
