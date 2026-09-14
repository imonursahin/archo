import { execFile } from 'child_process'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { withPath } from './shellenv'

const pexec = promisify(execFile)

async function git(dir: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await pexec('git', ['-C', dir, ...args], {
    // launched from Finder, git may not be on the inherited PATH
    env: withPath(env || process.env),
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

// ---------- Publishing an assistant as a git repo ----------
// An assistant folder is already a self-contained project, so sharing it is
// plain git: init, ignore the machine-local bits, commit, push.
const ASSISTANT_IGNORE_HEADER = '# Archo — machine-local, never shared\n'
const ASSISTANT_IGNORE_RULES = [
  // The MCP config is part of an assistant, but its `env` block holds server
  // API keys — a shared repo must not carry them. Force-add it yourself if
  // yours has no secrets in it.
  '.mcp.json',
  '**/.claude/settings.local.json',
  '**/.claude/logs/',
  '.env',
  '.env.*',
  '.DS_Store',
  'node_modules/'
]
// Rules whose files hold credentials — these are pulled out of the index even
// when an earlier commit already tracked them.
const SECRET_IGNORE_RULES = ['**/.claude/settings.local.json', '.env', '.env.*']
// The same files as git PATHSPECS — glob magic, so they match at any depth
// (a nested project inside an assistant has its own .claude folder).
const SECRET_PATHSPECS = [
  ':(glob)**/.claude/settings.local.json',
  ':(glob)**/.env',
  ':(glob)**/.env.*'
]

export interface RepoInfo {
  isRepo: boolean
  branch?: string
  dirty?: boolean
  remote?: string
  ahead?: number
}

export async function repoInfo(dir: string): Promise<RepoInfo> {
  const base = await gitBranch(dir)
  if (!base.isRepo) return { isRepo: false }
  const remote = (await git(dir, ['remote', 'get-url', 'origin']).catch(() => '')).trim()
  let ahead = 0
  try {
    const counts = await git(dir, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])
    ahead = parseInt(counts.trim().split(/\s+/)[0], 10) || 0
  } catch {
    // no upstream yet — everything local counts as unpublished
    const all = await git(dir, ['rev-list', '--count', 'HEAD']).catch(() => '0')
    ahead = parseInt(all.trim(), 10) || 0
  }
  return { ...base, remote: remote || undefined, ahead }
}

// init (if needed) + .gitignore + commit everything. Never pushes.
export async function publishAssistant(
  dir: string,
  message: string
): Promise<{ committed: boolean; branch: string }> {
  const isRepo = (await gitBranch(dir)).isRepo
  if (!isRepo) {
    await git(dir, ['init', '-b', 'main'])
  }
  // An existing .gitignore must not mean "no protection": every rule below has
  // to be present, or `git add -A` would stage credentials and local settings.
  const ignorePath = path.join(dir, '.gitignore')
  const current = await fs.readFile(ignorePath, 'utf8').catch(() => '')
  const have = new Set(current.split('\n').map((l) => l.trim()))
  const missing = ASSISTANT_IGNORE_RULES.filter((r) => !have.has(r))
  if (missing.length) {
    const prefix = current && !current.endsWith('\n') ? '\n' : ''
    await fs.writeFile(ignorePath, current + prefix + ASSISTANT_IGNORE_HEADER + missing.join('\n') + '\n', 'utf8')
  }
  // Anything committed before those rules existed would stay tracked, so drop it
  // from the index — but only the rules that carry secrets. The MCP config is
  // deliberately force-addable (the comment above says so), and un-tracking it on
  // every publish would delete it from a repo the user chose to share it in.
  for (const spec of SECRET_PATHSPECS)
    await git(dir, ['rm', '--cached', '-r', '--ignore-unmatch', spec]).catch(() => {})
  await git(dir, ['add', '-A'])
  // `git rm --cached` refuses when the file is staged with different content, so
  // verify rather than trust it — committing a credential is not recoverable.
  // no .catch: a failed check must not read as "nothing tracked"
  const stillTracked = (await git(dir, ['ls-files', '--', ...SECRET_PATHSPECS])).trim()
  if (stillTracked)
    throw new Error(`refusing to commit tracked local files: ${stillTracked.split('\n').join(', ')}`)
  const staged = (await git(dir, ['diff', '--cached', '--name-only'])).trim()
  if (staged) await git(dir, ['commit', '-m', message])
  // symbolic-ref, not rev-parse: a first publish that staged nothing leaves an
  // unborn HEAD, which rev-parse cannot resolve
  const branch = (await git(dir, ['symbolic-ref', '--short', 'HEAD']).catch(() => 'main')).trim()
  return { committed: !!staged, branch }
}

// A repository URL reaches git as an argument, so one starting with '-' is read
// as an OPTION — `--upload-pack=<cmd>` and `--config=core.sshCommand=<cmd>` both
// run an arbitrary command. Accept only shapes that are actually a repository.
const REPO_URL_RE =
  /^(https?:\/\/|git:\/\/|ssh:\/\/|file:\/\/|\/|[A-Za-z]:[\\/]|\\\\|[\w.-]+@[\w.-]+:)[^\s]*$/

function assertRepoUrl(url: string): string {
  const u = (url || '').trim()
  if (!REPO_URL_RE.test(u)) throw new Error(`unsupported repository URL: ${url}`)
  return u
}

export async function setRemote(dir: string, url: string): Promise<void> {
  const safe = assertRepoUrl(url)
  const existing = (await git(dir, ['remote']).catch(() => '')).trim().split('\n')
  if (existing.includes('origin')) await git(dir, ['remote', 'set-url', 'origin', safe])
  else await git(dir, ['remote', 'add', 'origin', safe])
}

export async function pushAssistant(dir: string, env?: NodeJS.ProcessEnv): Promise<string> {
  const branch = (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
  return git(dir, ['push', '-u', 'origin', branch], env)
}

export async function pullAssistant(dir: string, env?: NodeJS.ProcessEnv): Promise<string> {
  return git(dir, ['pull', '--ff-only'], env)
}

export async function cloneAssistant(
  url: string,
  targetDir: string,
  env?: NodeJS.ProcessEnv
): Promise<void> {
  const safe = assertRepoUrl(url)
  await pexec('git', ['clone', '--', safe, targetDir], {
    // same PATH floor as every other git call — this one does not go through git()
    env: withPath(env || process.env),
    maxBuffer: 1024 * 1024 * 32
  })
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i)
  return h
}
