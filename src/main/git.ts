import { execFile } from 'child_process'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

const pexec = promisify(execFile)

async function git(dir: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await pexec('git', ['-C', dir, ...args], {
    env: env || process.env,
    maxBuffer: 1024 * 1024 * 32
  })
  return stdout
}

// Lightweight: current branch + dirty flag for the toolbar indicator.
export async function gitBranch(
  dir: string
): Promise<{ isRepo: boolean; branch?: string; dirty?: boolean }> {
  if (!dir) return { isRepo: false }
  try {
    const branch = (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    const status = await git(dir, ['status', '--porcelain']).catch(() => '')
    return { isRepo: true, branch, dirty: status.trim().length > 0 }
  } catch {
    return { isRepo: false }
  }
}

export interface GitFile {
  path: string
  status: string // e.g. ' M', '??', 'A ', ' D'
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

export async function gitStatus(dir: string): Promise<GitStatus> {
  if (!dir) return { isRepo: false, files: [] }
  try {
    const out = await git(dir, ['status', '--porcelain=v1', '--branch'])
    const lines = out.split('\n')
    let branch: string | undefined
    const files: GitFile[] = []
    for (const line of lines) {
      if (!line) continue
      if (line.startsWith('##')) {
        // ## main...origin/main [ahead 1]
        const m = line.slice(2).trim().match(/^([^ .]+)/)
        branch = m?.[1]
        continue
      }
      const status = line.slice(0, 2)
      const file = line.slice(3)
      files.push({
        path: file,
        status,
        untracked: status === '??',
        added: 0,
        removed: 0
      })
    }
    // line counts for tracked changes
    const numstat = await git(dir, ['diff', '--numstat', 'HEAD']).catch(() => '')
    const counts = new Map<string, { added: number; removed: number }>()
    for (const l of numstat.split('\n')) {
      const parts = l.split('\t')
      if (parts.length < 3) continue
      counts.set(parts[2], {
        added: parseInt(parts[0], 10) || 0,
        removed: parseInt(parts[1], 10) || 0
      })
    }
    for (const f of files) {
      const c = counts.get(f.path)
      if (c) {
        f.added = c.added
        f.removed = c.removed
      } else if (f.untracked) {
        // count new-file lines as additions
        try {
          const txt = await fs.readFile(path.join(dir, f.path), 'utf8')
          f.added = txt ? txt.split('\n').length : 0
        } catch {
          /* binary/unreadable */
        }
      }
    }
    return { isRepo: true, branch, files }
  } catch (e: any) {
    const msg = String(e?.stderr || e?.message || e)
    if (/not a git repository/i.test(msg)) return { isRepo: false, files: [] }
    return { isRepo: false, files: [], error: msg }
  }
}

// Revert a single file to its last committed state (or delete if untracked).
export async function gitRevertFile(dir: string, file: string, untracked: boolean): Promise<void> {
  if (untracked) {
    await fs.rm(path.join(dir, file), { force: true }).catch(() => {})
  } else {
    await git(dir, ['checkout', 'HEAD', '--', file])
  }
}

export interface Checkpoint {
  sha: string
  message: string
  time: number
}

// Snapshot the working tree (tracked + untracked) into a dangling commit without
// touching the user's index or working tree. Returns the commit sha.
export async function gitCheckpoint(dir: string, message: string): Promise<Checkpoint> {
  const tmpIndex = path.join(os.tmpdir(), `as-idx-${process.pid}-${Math.abs(hash(dir))}`)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_INDEX_FILE: tmpIndex,
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || 'Archo',
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL || 'checkpoint@archo.local',
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME || 'Archo',
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL || 'checkpoint@archo.local'
  }
  try {
    await git(dir, ['add', '-A'], env)
    const tree = (await git(dir, ['write-tree'], env)).trim()
    let parent: string | null = null
    try {
      parent = (await git(dir, ['rev-parse', 'HEAD'])).trim()
    } catch {
      parent = null
    }
    const args = ['commit-tree', tree, '-m', message]
    if (parent) args.push('-p', parent)
    const sha = (await git(dir, args, env)).trim()
    return { sha, message, time: Date.now() }
  } finally {
    await fs.rm(tmpIndex, { force: true }).catch(() => {})
  }
}

// Restore working-tree files to a checkpoint's content.
export async function gitRestoreCheckpoint(dir: string, sha: string): Promise<void> {
  await git(dir, ['checkout', sha, '--', '.'])
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i)
  return h
}
