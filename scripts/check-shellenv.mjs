// Self-check for the spawn environment helpers: PATH floor, Windows argv
// quoting and the transcript folder slug.
// Run: node scripts/check-shellenv.mjs
import { buildSync } from 'esbuild'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const out = path.join(os.tmpdir(), `archo-shellenv-${Date.now()}.mjs`)
// the JS API, not the .bin shim — that shim is esbuild.cmd on Windows
buildSync({
  entryPoints: [path.join(root, 'src/main/shellenv.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out
})

// the module reads process.platform at load, so each platform needs its own
// instance — the query string is what defeats the ESM module cache
const realPlatform = process.platform
async function loadAs(platform, tag) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  const mod = await import(`${pathToFileURL(out).href}?p=${tag}`)
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true })
  return mod
}
const posix = await loadAs('darwin', 'posix')
const win = await loadAs('win32', 'win')
// pathFloor/withPath read process.platform per call, so the branch has to be
// pinned around the call too — not just around the import
function asPlatform(platform, fn) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  try {
    return fn()
  } finally {
    Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true })
  }
}

// --- needsShell: true only on Windows -------------------------------------
assert.strictEqual(win.needsShell, true, 'Windows .cmd shims need a shell')
assert.strictEqual(posix.needsShell, false, 'POSIX must not route spawns through a shell')

// --- shellArgv: identity on POSIX -----------------------------------------
const raw = ['claude', 'plugin list', 'a&b']
assert.deepStrictEqual(posix.shellArgv(raw), raw, 'POSIX argv must pass through untouched')
assert.strictEqual(posix.shellArgv(raw), raw, 'POSIX returns the same array, no copy')

// --- shellArgv: Windows quoting -------------------------------------------
// a space or a quote wraps the whole argument, with " escaped as \"
assert.deepStrictEqual(win.shellArgv(['plugin list']), ['"plugin list"'])
assert.deepStrictEqual(win.shellArgv(['say "hi"']), ['"say \\"hi\\""'])
assert.deepStrictEqual(win.shellArgv(['no"space']), ['"no\\"space"'])
// a bare argument gets a caret before each cmd.exe metacharacter instead
assert.deepStrictEqual(win.shellArgv(['a&b']), ['a^&b'])
assert.deepStrictEqual(win.shellArgv(['%!^&|<>()']), ['^%^!^^^&^|^<^>^(^)'])
assert.deepStrictEqual(win.shellArgv(['plain']), ['plain'], 'a plain argument stays plain')

// --- pathFloor: platform branch -------------------------------------------
const home = os.homedir()
assert.deepStrictEqual(asPlatform('win32', () => win.pathFloor()), [
  path.join(home, 'AppData', 'Roaming', 'npm'),
  path.join(home, '.local', 'bin')
])
const floor = asPlatform('darwin', () => posix.pathFloor())
assert.strictEqual(floor.length, 8, 'POSIX floor is the eight homebrew/system entries')
assert.ok(floor.includes('/opt/homebrew/bin'), 'brew-installed claude must resolve')
// home-relative entries are built with path.join, never string concatenation
assert.ok(floor.includes(path.join(home, '.local', 'bin')))

// --- withPath: append, dedupe, platform delimiter -------------------------
const merged = asPlatform('darwin', () => posix.withPath({ PATH: '/usr/bin', HOME: home }))
const entries = merged.PATH.split(path.delimiter)
assert.strictEqual(entries[0], '/usr/bin', 'the caller PATH keeps priority')
assert.ok(entries.includes('/opt/homebrew/bin'), 'the floor is appended')
assert.strictEqual(merged.HOME, home, 'unrelated env keys survive')
assert.strictEqual(
  entries.filter((e) => e === '/usr/bin').length,
  1,
  'the Set must collapse a duplicate entry'
)
assert.ok(merged.PATH.includes(path.delimiter) || entries.length === 1)
assert.ok(!merged.PATH.includes(':/') || path.delimiter === ':', 'join uses path.delimiter')

// an empty PATH still gets the floor
assert.ok(asPlatform('darwin', () => posix.withPath({ PATH: '' })).PATH.includes('/usr/bin'))

// --- withPath: the lowercase Windows "Path" key ---------------------------
const fromWindows = asPlatform('win32', () => win.withPath({ Path: 'C:\\tools' }))
assert.ok(fromWindows.PATH.includes('C:\\tools'), 'a lowercase Path key must be read')
assert.strictEqual(fromWindows.Path, undefined, 'two disagreeing PATH keys would be a bug')
assert.ok(!Object.keys(fromWindows).includes('Path'))

// --- projectSlug: every separator flattens to a dash ----------------------
assert.strictEqual(posix.projectSlug('C:\\Users\\x\\proj'), 'C--Users-x-proj')
assert.strictEqual(posix.projectSlug('/Users/onur/my.app'), '-Users-onur-my-app')
// Backward compatibility: on a colon-free POSIX path the widened regex must
// still agree with the old inline replace(/[/.]/g, '-')
for (const p of ['/Users/onur/proj', '/a/b.c/d', '/']) {
  assert.strictEqual(posix.projectSlug(p), p.replace(/[/.]/g, '-'), `slug drifted for ${p}`)
}

await fs.rm(out, { force: true })
console.log('ok — shell environment helpers')
