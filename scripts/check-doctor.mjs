// Self-check for the environment doctor: each check's three branches, and the
// promise that no environment makes runDoctor throw across the IPC boundary.
// Run: node scripts/check-doctor.mjs
import { buildSync } from 'esbuild'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archo-doctor-'))

// both the CLIs and the home directory are stubbed: what is under test is the
// branching, not whether this machine happens to have gh installed
const cpStub = path.join(tmp, 'cp-stub.mjs')
await fs.writeFile(
  cpStub,
  `import { promisify } from 'util'
globalThis.__calls = []
globalThis.__reply = () => ({ stdout: '', stderr: '' })
export function execFile() {}
execFile[promisify.custom] = async (file, args, opts) => {
  globalThis.__calls.push({ file, args, opts })
  const r = await globalThis.__reply(file, args)
  if (r === null) throw Object.assign(new Error('Command failed'), { code: 1 })
  return r
}
export default { execFile }
`
)
const osStub = path.join(tmp, 'os-stub.mjs')
await fs.writeFile(
  osStub,
  `import { createRequire } from 'module'
// createRequire, not \`import from 'os'\` — that import would be aliased back to
// this same stub and resolve to itself
const real = createRequire(import.meta.url)('os')
export const homedir = () => globalThis.__home || real.homedir()
export const tmpdir = real.tmpdir
export const platform = real.platform
export default { ...real, homedir, tmpdir }
`
)

const out = path.join(tmp, 'doctor.mjs')
// the JS API, not the .bin shim — that shim is esbuild.cmd on Windows
buildSync({
  entryPoints: [path.join(root, 'src/main/doctor.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  alias: { child_process: cpStub, os: osStub }
})
const { runDoctor } = await import(pathToFileURL(out).href)

const calls = () => globalThis.__calls
const reset = (reply) => {
  globalThis.__calls = []
  globalThis.__reply = reply || (() => ({ stdout: '', stderr: '' }))
}
const ok = (stdout) => ({ stdout, stderr: '' })
const byId = (list, id) => list.find((c) => c.id === id)

const realPlatform = process.platform
const setPlatform = (p) =>
  Object.defineProperty(process, 'platform', { value: p, configurable: true })

const home = path.join(tmp, 'home')
await fs.mkdir(path.join(home, '.claude'), { recursive: true })
globalThis.__home = home
const assistantsRoot = path.join(tmp, 'assistants')

// a reply table keyed by the command being run
const replies = (table) => (file, args) => {
  const key = `${file} ${args.join(' ')}`
  for (const [prefix, value] of Object.entries(table))
    if (key.startsWith(prefix)) return value
  return null
}

// ================================================================ checkClaude
// a missing CLI is fail, not warn — unlike the optional binaries below
reset(replies({}))
let r = await runDoctor(assistantsRoot)
let claude = byId(r, 'claude')
assert.strictEqual(claude.status, 'fail', 'a missing claude CLI is fatal, not a warning')
assert.strictEqual(claude.detail, 'not found on PATH')
assert.strictEqual(claude.hint, 'npm i -g @anthropic-ai/claude-code')

reset(replies({ claude: ok('1.2.3') }))
claude = byId(await runDoctor(assistantsRoot), 'claude')
assert.strictEqual(claude.status, 'ok')
assert.strictEqual(claude.detail, '1.2.3')

// ================================================================ checkBinary
// a missing optional binary is only a warning
reset(replies({ 'node --version': ok('v20.0.0\ntrailing noise\nmore') }))
r = await runDoctor(assistantsRoot)
assert.strictEqual(byId(r, 'git').status, 'warn', 'a missing git is a warning, not a failure')
assert.strictEqual(byId(r, 'git').detail, 'not found on PATH')
assert.strictEqual(byId(r, 'node').status, 'ok')
assert.strictEqual(byId(r, 'node').detail, 'v20.0.0', 'only the first line may reach the UI')

// ================================================================== checkAuth
// 1) the credentials file wins
const credFile = path.join(home, '.claude', '.credentials.json')
await fs.writeFile(credFile, '{}')
reset(replies({}))
let auth = byId(await runDoctor(assistantsRoot), 'auth')
assert.strictEqual(auth.status, 'ok')
assert.strictEqual(auth.detail, '~/.claude/.credentials.json')
assert.ok(!calls().some((c) => c.file === 'security'), 'the Keychain must not be consulted at all')

// 2) no file, darwin, Keychain answers
await fs.rm(credFile)
setPlatform('darwin')
reset(replies({ 'security find-generic-password': ok('sk-live-token') }))
auth = byId(await runDoctor(assistantsRoot), 'auth')
assert.strictEqual(auth.status, 'ok')
assert.strictEqual(auth.detail, 'macOS Keychain')
const sec = calls().find((c) => c.file === 'security')
assert.deepStrictEqual(sec.args, ['find-generic-password', '-s', 'Claude Code-credentials', '-w'])

// 3) neither
reset(replies({}))
auth = byId(await runDoctor(assistantsRoot), 'auth')
assert.strictEqual(auth.status, 'warn')
assert.strictEqual(auth.detail, 'no stored credentials found')
assert.strictEqual(auth.hint, 'run `claude` once in a terminal and log in')

// 4) off darwin the Keychain branch is never attempted
setPlatform('win32')
reset(replies({ 'security find-generic-password': ok('sk-live-token') }))
auth = byId(await runDoctor(assistantsRoot), 'auth')
assert.strictEqual(auth.status, 'warn', 'the Keychain must not be read off darwin')
assert.ok(!calls().some((c) => c.file === 'security'), 'security was invoked on a non-darwin host')
setPlatform(realPlatform)

// ================================================================ checkGhAuth
reset(
  replies({
    'gh auth status': ok(
      'github.com\n  ✓ Logged in to github.com account imonursahin (keyring)\n  - Token scopes: repo'
    )
  })
)
let gh = byId(await runDoctor(assistantsRoot), 'gh-auth')
assert.strictEqual(gh.status, 'ok')
assert.strictEqual(gh.detail, '@imonursahin')

// logged in, but no account line to parse
reset(replies({ 'gh auth status': ok('github.com\n  ✓ Token valid') }))
gh = byId(await runDoctor(assistantsRoot), 'gh-auth')
assert.strictEqual(gh.status, 'ok')
assert.strictEqual(gh.detail, 'logged in')

// run() answered null — gh is missing or logged out
reset(replies({}))
gh = byId(await runDoctor(assistantsRoot), 'gh-auth')
assert.strictEqual(gh.status, 'warn')
assert.strictEqual(gh.detail, 'gh missing or not logged in')
assert.strictEqual(gh.hint, 'gh auth login')

// ============================================================ checkTranscripts
const projects = path.join(home, '.claude', 'projects')
reset(replies({}))
let tr = byId(await runDoctor(assistantsRoot), 'transcripts')
assert.strictEqual(tr.status, 'warn')
assert.strictEqual(tr.hint, 'usage and transcript search stay empty until Claude has run once')

await fs.mkdir(path.join(projects, '-Users-x-a'), { recursive: true })
await fs.mkdir(path.join(projects, '-Users-x-b'), { recursive: true })
tr = byId(await runDoctor(assistantsRoot), 'transcripts')
assert.strictEqual(tr.status, 'ok')
assert.strictEqual(tr.detail, '2 projects in ~/.claude/projects')

// ========================================================= checkAssistantsRoot
await fs.mkdir(path.join(assistantsRoot, 'one'), { recursive: true })
await fs.mkdir(path.join(assistantsRoot, 'two'), { recursive: true })
await fs.writeFile(path.join(assistantsRoot, 'notes.txt'), 'x') // a file is not an assistant
let rootCheck = byId(await runDoctor(assistantsRoot), 'root')
assert.strictEqual(rootCheck.status, 'ok')
assert.strictEqual(rootCheck.detail, `2 assistants · ${assistantsRoot}`)
// the write probe must not survive the check
assert.ok(
  !(await fs.readdir(assistantsRoot)).includes('.archo-write-probe'),
  'the write probe was left behind'
)

// a non-writable root fails, with the OS error as the hint
if (process.platform !== 'win32' && process.getuid && process.getuid() !== 0) {
  const locked = path.join(tmp, 'locked-root')
  await fs.mkdir(locked, { recursive: true })
  await fs.chmod(locked, 0o500) // exists, but the probe cannot be written
  rootCheck = byId(await runDoctor(locked), 'root')
  assert.strictEqual(rootCheck.status, 'fail', 'an unwritable root must fail the probe')
  assert.strictEqual(rootCheck.detail, `not writable — ${locked}`)
  assert.match(rootCheck.hint, /EACCES|EPERM|permission/i, 'the OS error must reach the hint')
  await fs.chmod(locked, 0o755)
}

// ================================================================== runDoctor
// the result array keeps its declared order, whatever each check answers
reset(replies({ claude: ok('1.2.3'), 'gh auth status': ok('account x') }))
r = await runDoctor(assistantsRoot)
assert.deepStrictEqual(
  r.map((c) => c.id),
  ['claude', 'auth', 'root', 'transcripts', 'git', 'node', 'gh-auth'],
  'the declared order must survive Promise.all'
)
assert.strictEqual(r.length, 7, 'all seven checks must report')
for (const c of r) {
  assert.ok(['ok', 'warn', 'fail'].includes(c.status), `${c.id} has no valid status`)
  assert.strictEqual(typeof c.detail, 'string')
  assert.ok(c.label, `${c.id} has no label`)
}

// they run in parallel: seven checks at 120ms each finish well under 840ms
reset(async () => {
  await new Promise((res) => setTimeout(res, 120))
  return null
})
const started = Date.now()
await runDoctor(assistantsRoot)
const elapsed = Date.now() - started
// 840ms is the serial floor (7 x 120ms); anything well under it proves parallel
assert.ok(elapsed < 800, `the checks ran serially (${elapsed}ms)`)

// no environment makes the doctor reject — a rejection would cross the IPC
// boundary as an error instead of a result. (A check that THREW would still
// collapse Promise.all today; every check is written to return instead.)
reset(() => {
  throw Object.assign(new Error('exploded'), { stderr: 'boom' })
})
r = await runDoctor(path.join(tmp, 'does', 'not', 'exist', 'yet'))
assert.strictEqual(r.length, 7, 'a failing command must not reject the doctor')

// ======================================================================== run
// every invocation carries the shell flags — claude/gh are .cmd shims on Windows
const shellenvOut = path.join(tmp, 'shellenv.mjs')
buildSync({
  entryPoints: [path.join(root, 'src/main/shellenv.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: shellenvOut
})
const { shellArgv, needsShell, pathFloor } = await import(pathToFileURL(shellenvOut).href)
reset(replies({}))
await runDoctor(assistantsRoot)
assert.ok(calls().length > 0)
for (const c of calls()) {
  assert.strictEqual(c.opts.shell, needsShell, 'the .cmd shim needs a shell on Windows')
  assert.deepStrictEqual(c.args, shellArgv(c.args), 'the argv must be shellArgv-quoted')
  assert.strictEqual(c.opts.timeout, 8000, 'a hung CLI must not hang the doctor')
  for (const entry of pathFloor())
    assert.ok(c.opts.env.PATH.split(path.delimiter).includes(entry), `PATH floor lost ${entry}`)
}

await fs.rm(tmp, { recursive: true, force: true })
console.log('ok — environment doctor')
