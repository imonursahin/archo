import { execFile } from 'child_process'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { shellEnv, shellArgv, needsShell } from './shellenv'

const pexec = promisify(execFile)

export interface Check {
  id: string
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  hint?: string
}

async function run(cmd: string, args: string[]): Promise<string | null> {
  try {
    // claude/gh are .cmd shims on Windows; without a shell they look "missing"
    const { stdout } = await pexec(cmd, shellArgv(args), {
      env: shellEnv(),
      timeout: 8000,
      shell: needsShell
    })
    return stdout.trim()
  } catch {
    return null
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

async function checkClaude(): Promise<Check> {
  const version = await run('claude', ['--version'])
  if (!version)
    return {
      id: 'claude',
      label: 'Claude Code CLI',
      status: 'fail',
      detail: 'not found on PATH',
      hint: 'npm i -g @anthropic-ai/claude-code'
    }
  return { id: 'claude', label: 'Claude Code CLI', status: 'ok', detail: version }
}

async function checkAuth(): Promise<Check> {
  const credFile = path.join(os.homedir(), '.claude', '.credentials.json')
  if (await exists(credFile))
    return { id: 'auth', label: 'Claude login', status: 'ok', detail: '~/.claude/.credentials.json' }
  if (process.platform === 'darwin') {
    const kc = await run('security', [
      'find-generic-password',
      '-s',
      'Claude Code-credentials',
      '-w'
    ])
    if (kc) return { id: 'auth', label: 'Claude login', status: 'ok', detail: 'macOS Keychain' }
  }
  return {
    id: 'auth',
    label: 'Claude login',
    status: 'warn',
    detail: 'no stored credentials found',
    hint: 'run `claude` once in a terminal and log in'
  }
}

async function checkBinary(id: string, label: string, args: string[]): Promise<Check> {
  const out = await run(id, args)
  return out
    ? { id, label, status: 'ok', detail: out.split('\n')[0] }
    : { id, label, status: 'warn', detail: 'not found on PATH' }
}

async function checkGhAuth(): Promise<Check> {
  const out = await run('gh', ['auth', 'status'])
  if (out === null)
    return {
      id: 'gh-auth',
      label: 'GitHub CLI login',
      status: 'warn',
      detail: 'gh missing or not logged in',
      hint: 'gh auth login'
    }
  const who = out.match(/account (\S+)/)
  return {
    id: 'gh-auth',
    label: 'GitHub CLI login',
    status: 'ok',
    detail: who ? `@${who[1]}` : 'logged in'
  }
}

async function checkTranscripts(): Promise<Check> {
  const dir = path.join(os.homedir(), '.claude', 'projects')
  try {
    const entries = await fs.readdir(dir)
    return {
      id: 'transcripts',
      label: 'Claude transcripts',
      status: 'ok',
      detail: `${entries.length} projects in ~/.claude/projects`
    }
  } catch {
    return {
      id: 'transcripts',
      label: 'Claude transcripts',
      status: 'warn',
      detail: '~/.claude/projects not found',
      hint: 'usage and transcript search stay empty until Claude has run once'
    }
  }
}

async function checkAssistantsRoot(root: string): Promise<Check> {
  try {
    await fs.mkdir(root, { recursive: true })
    const probe = path.join(root, '.archo-write-probe')
    await fs.writeFile(probe, '')
    await fs.rm(probe)
    const dirs = (await fs.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory())
    return {
      id: 'root',
      label: 'Assistants folder',
      status: 'ok',
      detail: `${dirs.length} assistants · ${root}`
    }
  } catch (e) {
    return {
      id: 'root',
      label: 'Assistants folder',
      status: 'fail',
      detail: `not writable — ${root}`,
      hint: String((e as Error)?.message || e)
    }
  }
}

export async function runDoctor(assistantsRoot: string): Promise<Check[]> {
  return Promise.all([
    checkClaude(),
    checkAuth(),
    checkAssistantsRoot(assistantsRoot),
    checkTranscripts(),
    checkBinary('git', 'git', ['--version']),
    checkBinary('node', 'node', ['--version']),
    checkGhAuth()
  ])
}
