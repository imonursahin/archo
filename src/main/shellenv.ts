import path from 'path'
import os from 'os'

// Launched from Finder (or the Windows/Linux equivalent) the app inherits a bare
// PATH, so brew/claude/gh do not resolve. Every place that spawns a process goes
// through here, and the platform's own separator is used — ':' hardcoded would
// flatten a Windows PATH into one bogus entry.
export function pathFloor(): string[] {
  const home = os.homedir()
  if (process.platform === 'win32') {
    return [
      path.join(home, 'AppData', 'Roaming', 'npm'),
      path.join(home, '.local', 'bin')
    ]
  }
  return [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    path.join(home, '.local', 'bin'),
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ]
}

export function withPath<T extends Record<string, string | undefined>>(env: T): T {
  // Windows env vars are case-insensitive and may arrive as "Path"
  const current = env.PATH || (env as Record<string, string | undefined>).Path || ''
  const existing = current.split(path.delimiter).filter(Boolean)
  const merged = [...new Set([...existing, ...pathFloor()])].join(path.delimiter)
  const out = { ...env, PATH: merged }
  delete (out as Record<string, string | undefined>).Path // never two PATH keys disagreeing
  return out
}

export function shellEnv(): NodeJS.ProcessEnv {
  return withPath(process.env)
}

// A Windows CLI installed by npm is a .cmd shim, and Node refuses to spawn one
// without a shell. With `shell: true` Node joins argv with spaces and quotes
// NOTHING, so anything containing a space has to be quoted here or it arrives
// as two arguments.
export const needsShell = process.platform === 'win32'

export function shellArgv(args: string[]): string[] {
  if (!needsShell) return args
  return args.map((a) => {
    // inside double quotes cmd.exe only honours the backslash-escaped quote;
    // bare arguments need the caret for its metacharacters instead
    if (/[\s"]/.test(a)) return `"${a.replace(/"/g, '\\"')}"`
    return a.replace(/([%!^&|<>()])/g, '^$1')
  })
}

// Claude Code names a project's transcript folder after its cwd, with every
// path separator and dot flattened to a dash. On Windows that means the drive
// colon and backslashes too — miss them and every usage/transcript lookup
// silently finds nothing.
export function projectSlug(cwd: string): string {
  return cwd.replace(/[/\\.:]/g, '-')
}
