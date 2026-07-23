import { promises as fs } from 'fs'
import path from 'path'
import type { Dirent } from 'fs'

export function parseFrontmatter(text: string): { data: Record<string, string>; body: string } {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { data: {}, body: text }
  const data: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim()
    if (key) data[key] = val
  }
  return { data, body: m[2] }
}

export async function safeReadDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir)
  } catch {
    return []
  }
}

export async function readJson(file: string): Promise<any | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

export async function walkForFile(
  root: string,
  target: string,
  maxDepth = 6,
  acc: string[] = []
): Promise<string[]> {
  if (maxDepth < 0) return acc
  let entries: Dirent[]
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const e of entries) {
    const full = path.join(root, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      await walkForFile(full, target, maxDepth - 1, acc)
    } else if (e.name === target) {
      acc.push(full)
    }
  }
  return acc
}

export async function walkForDirMd(root: string, subdir: string, maxDepth = 6): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth < 0) return
    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      if (e.name === 'node_modules' || e.name === '.git') continue
      const full = path.join(dir, e.name)
      if (e.name === subdir) {
        for (const f of await safeReadDir(full)) {
          if (/\.(md|mdc)$/.test(f)) out.push(path.join(full, f))
        }
      } else {
        await walk(full, depth - 1)
      }
    }
  }
  await walk(root, maxDepth)
  return out
}

export function pluginNameFromPath(file: string): string | undefined {
  const m = file.match(/\/(?:plugins|external_plugins)\/([^/]+)\//)
  return m?.[1]
}
