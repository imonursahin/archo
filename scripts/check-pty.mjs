// Self-check for terminal spawning: the shell and its argument shape per
// platform, the environment handed to it, and the live-terminal list that
// pruneLogs uses as its keep-list.
// Run: node scripts/check-pty.mjs
import { buildSync } from 'esbuild'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archo-pty-'))

// node-pty is a native addon built for Electron's ABI and electron itself has
// no API outside the app, so both are replaced with recording stubs — the pty
// is not what is under test here, the arguments handed to it are.
const ptyStub = path.join(tmp, 'pty-stub.mjs')
await fs.writeFile(
  ptyStub,
  `globalThis.__spawns = []
export function spawn(file, args, opts) {
  globalThis.__spawns.push({ file, args, opts })
  return {
    pid: 4242,
    onData() {},
    onExit() {},
    write() {},
    resize() {},
    kill() {}
  }
}
export default { spawn }
`
)
const electronStub = path.join(tmp, 'electron-stub.mjs')
await fs.writeFile(
  electronStub,
  `export class BrowserWindow {}
export default { BrowserWindow }
`
)

const out = path.join(tmp, 'pty.mjs')
// the JS API, not the .bin shim — that shim is esbuild.cmd on Windows
buildSync({
  entryPoints: [path.join(root, 'src/main/pty.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  alias: { 'node-pty': ptyStub, electron: electronStub }
})
const { createTerm, killTerm, liveTermIds, isLive } = await import(pathToFileURL(out).href)

const fakeWin = { webContents: { send() {} }, isDestroyed: () => false }
const spawns = () => globalThis.__spawns
const lastSpawn = () => spawns()[spawns().length - 1]

// ================================================= shell + shellArgs on POSIX
// (this module reads process.platform at load, so only the host platform's
// branch can actually be executed — the other one is pinned from the source)
createTerm(fakeWin, 'plain', { cwd: tmp })
let s = lastSpawn()
if (process.platform === 'win32') {
  assert.strictEqual(s.file, 'powershell.exe', 'Windows must use PowerShell, not COMSPEC')
  assert.deepStrictEqual(s.args, ['-NoLogo'])
} else {
  const expected = process.env.SHELL || (existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/bash')
  assert.strictEqual(s.file, expected, '$SHELL wins on POSIX')
  assert.deepStrictEqual(s.args, ['-i'], 'no command means a plain interactive shell')
}

// a silent command keeps the shell open afterwards
createTerm(fakeWin, 'withcmd', { cwd: tmp, command: 'echo hi', silent: true })
s = lastSpawn()
if (process.platform === 'win32') {
  assert.deepStrictEqual(s.args, ['-NoExit', '-Command', 'echo hi'])
} else {
  assert.deepStrictEqual(s.args, ['-i', '-c', `echo hi; exec ${s.file} -i`])
}

// a non-silent command is typed into the terminal instead, so the argv stays bare
createTerm(fakeWin, 'typed', { cwd: tmp, command: 'echo hi' })
assert.deepStrictEqual(
  lastSpawn().args,
  process.platform === 'win32' ? ['-NoLogo'] : ['-i'],
  'a non-silent command must not reach the argv'
)

// the branch that cannot run on this host is pinned from the source
const src = await fs.readFile(path.join(root, 'src/main/pty.ts'), 'utf8')
assert.match(src, /isWin\s*\n?\s*\?\s*'powershell\.exe'/, 'the Windows shell changed')
assert.match(src, /\['-NoExit', '-Command', command\]/, 'the PowerShell argument shape changed')
assert.match(src, /\['-NoLogo'\]/)
assert.match(src, /\['-i', '-c', `\$\{command\}; exec \$\{shell\} -i`\]/, 'the POSIX shape changed')
assert.match(src, /existsSync\('\/bin\/zsh'\) \? '\/bin\/zsh' : '\/bin\/bash'/, 'the zsh/bash fallback')

// ===================================================================== cleanEnv
// the markers that make a nested `claude` misbehave are stripped
const marked = { CLAUDECODE: '1', CLAUDE_CODE_ENTRYPOINT: 'cli', CLAUDE_EFFORT: 'high', KEEPME: 'yes' }
const saved = {}
for (const [k, v] of Object.entries(marked)) {
  saved[k] = process.env[k]
  process.env[k] = v
}
createTerm(fakeWin, 'env', { cwd: tmp })
const env = lastSpawn().opts.env
for (const k of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_EFFORT'])
  assert.ok(!(k in env), `${k} leaked into the terminal`)
assert.strictEqual(env.KEEPME, 'yes', 'unrelated variables must survive')
assert.strictEqual(env.TERM, 'xterm-256color')
assert.strictEqual(env.COLORTERM, 'truecolor')
assert.strictEqual(env.TERM_PROGRAM, 'AgentStudio')
for (const [k, v] of Object.entries(saved)) {
  if (v === undefined) delete process.env[k]
  else process.env[k] = v
}

// the inlined PATH floor is gone, replaced by withPath — same POSIX result
const shellenvOut = path.join(tmp, 'shellenv.mjs')
buildSync({
  entryPoints: [path.join(root, 'src/main/shellenv.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: shellenvOut
})
const { withPath, pathFloor } = await import(pathToFileURL(shellenvOut).href)
for (const entry of pathFloor())
  assert.ok(env.PATH.split(path.delimiter).includes(entry), `PATH floor lost ${entry}`)
assert.strictEqual(
  env.PATH,
  withPath({ ...process.env }).PATH,
  'the terminal PATH drifted from withPath'
)

// ================================================================= liveTermIds
// index.ts feeds this straight into pruneLogs as the keep-list, so a wrong
// answer deletes the log of a terminal that is still recording
assert.deepStrictEqual(
  liveTermIds().sort(),
  ['env', 'plain', 'typed', 'withcmd'],
  'every created terminal must be reported live'
)
assert.strictEqual(isLive('plain'), true)
for (const id of ['env', 'plain', 'typed', 'withcmd']) killTerm(id)
assert.deepStrictEqual(liveTermIds(), [], 'a killed terminal must drop out of the keep-list')
assert.strictEqual(isLive('plain'), false)

// a fresh id is live only after createTerm, and creating it twice is a no-op
const countBefore = spawns().length
createTerm(fakeWin, 'again', { cwd: tmp })
createTerm(fakeWin, 'again', { cwd: tmp })
assert.strictEqual(spawns().length, countBefore + 1, 'a duplicate id must not spawn twice')
assert.deepStrictEqual(liveTermIds(), ['again'])
killTerm('again')
assert.deepStrictEqual(liveTermIds(), [])

await fs.rm(tmp, { recursive: true, force: true })
console.log('ok — terminal spawn shape and live-terminal list')
process.exit(0) // the module's busy-watch interval keeps the loop alive otherwise
