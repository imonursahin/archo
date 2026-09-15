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
globalThis.__disposed = 0
export function spawn(file, args, opts) {
  const exits = []
  const proc = {
    pid: 4242,
    writes: [],
    onData() {
      return { dispose() {} }
    },
    // the real IPty hands back a disposable; killTermAndWait relies on it to
    // let go of its listener, so the stub has to model that too
    onExit(fn) {
      exits.push(fn)
      return {
        dispose() {
          globalThis.__disposed++
          const i = exits.indexOf(fn)
          if (i >= 0) exits.splice(i, 1)
        }
      }
    },
    write(d) {
      proc.writes.push(d)
    },
    resize() {},
    kill() {},
    // fire the exit the real pty would fire when the process actually dies
    fireExit(exitCode = 0) {
      for (const fn of exits.slice()) fn({ exitCode })
    }
  }
  globalThis.__spawns.push({ file, args, opts, proc })
  return proc
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
const {
  createTerm,
  killTerm,
  liveTermIds,
  isLive,
  writeTerm,
  writeSystem,
  idleMs,
  outputSinceInputMs,
  killTermAndWait,
  resizeTerm,
  foreground,
  recentOutput,
  snapshot,
  killAll
} = await import(pathToFileURL(out).href)

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

// ============================================ accessors for a terminal that is gone
// Every one of these is called from an ipc handler holding an id the renderer
// remembered. A terminal can exit between the render and the click, so a stale
// id is ordinary, not exceptional: each must answer emptily rather than throw a
// rejection into the renderer.
assert.deepStrictEqual(liveTermIds(), [], 'precondition: nothing is live')
assert.strictEqual(foreground('gone'), '', 'foreground of a dead id is empty')
assert.strictEqual(recentOutput('gone'), '', 'recentOutput of a dead id is empty')
assert.strictEqual(snapshot('gone'), null, 'snapshot of a dead id is null, not an empty buffer')
assert.doesNotThrow(() => writeTerm('gone', 'ls\n'), 'writing to a dead id must not throw')
assert.doesNotThrow(() => resizeTerm('gone', 80, 24), 'resizing a dead id must not throw')
assert.doesNotThrow(() => killTerm('gone'), 'killing a dead id must not throw')

// ======================================================= accessors while live
createTerm(fakeWin, 'acc', { cwd: tmp })
// snapshot is what a reattaching view restores from — it must be a real buffer
// plus the sequence number that view resumes at, never null for a live terminal
const snap = snapshot('acc')
assert.notStrictEqual(snap, null, 'a live terminal must have a snapshot')
assert.strictEqual(typeof snap.buffer, 'string', 'the snapshot carries the output buffer')
assert.strictEqual(typeof snap.seq, 'number', 'the snapshot carries the resume sequence')
// foreground and recentOutput drive the idle indicator: both must stay strings,
// so a missing value reads as "nothing running" rather than crashing the poll
assert.strictEqual(typeof foreground('acc'), 'string')
assert.strictEqual(typeof recentOutput('acc'), 'string')
assert.doesNotThrow(() => writeTerm('acc', 'echo hi\n'))
assert.doesNotThrow(() => resizeTerm('acc', 120, 40))

// a killed terminal stops answering, or a reattach would restore a dead session
killTerm('acc')
assert.strictEqual(snapshot('acc'), null, 'a killed terminal keeps no snapshot')
assert.strictEqual(foreground('acc'), '')

// ===================================================================== killAll
// quitting the app runs this; anything left behind is an orphaned pty and an
// open recording stream
createTerm(fakeWin, 'a1', { cwd: tmp })
createTerm(fakeWin, 'a2', { cwd: tmp })
assert.strictEqual(liveTermIds().length, 2, 'precondition: two live terminals')
killAll()
assert.deepStrictEqual(liveTermIds(), [], 'killAll must leave nothing live')
assert.strictEqual(isLive('a1'), false)
assert.doesNotThrow(() => killAll(), 'killAll with nothing live must not throw')

// ======================================================== writeSystem vs writeTerm
// Both reach the pty; only one of them is the user. A /rename Archo delivers
// itself must not stamp lastInput, or "nobody has typed here" is never true
// again and the unattended rename path stops firing for that terminal forever.
createTerm(fakeWin, 'sys', { cwd: tmp })
const sysProc = lastSpawn().proc
writeSystem('sys', '/rename PA-1\r')
assert.deepStrictEqual(sysProc.writes, ['/rename PA-1\r'], 'writeSystem must reach the pty')
assert.strictEqual(
  outputSinceInputMs('sys'),
  Infinity,
  'writeSystem must not count as the user typing'
)
writeTerm('sys', 'ls\n')
assert.deepStrictEqual(
  sysProc.writes,
  ['/rename PA-1\r', 'ls\n'],
  'writeTerm must reach the same pty'
)
assert.notStrictEqual(
  outputSinceInputMs('sys'),
  Infinity,
  'writeTerm must stamp lastInput — it is the user'
)
assert.doesNotThrow(() => writeSystem('gone', 'x'), 'writeSystem to a dead id must not throw')

// ======================================================================= idleMs
// The rename readiness check gates on this, so a fresh terminal must read as
// recently-active rather than as never having produced anything.
assert.ok(idleMs('sys') >= 0, 'idleMs is never negative')
assert.ok(idleMs('sys') < 5000, 'a freshly created terminal must not look long-idle')
assert.strictEqual(idleMs('gone'), Infinity, 'an unknown id has been idle forever')

// ========================================================== outputSinceInputMs
// Three branches, and the two Infinity ones mean the opposite of each other to
// the caller: unknown terminal vs. a terminal nobody has typed into yet.
assert.strictEqual(outputSinceInputMs('gone'), Infinity, 'an unknown id yields Infinity')
createTerm(fakeWin, 'never', { cwd: tmp })
assert.strictEqual(outputSinceInputMs('never'), Infinity, 'lastInput === 0 yields Infinity')
writeTerm('never', 'a')
assert.strictEqual(typeof outputSinceInputMs('never'), 'number')
assert.notStrictEqual(outputSinceInputMs('never'), Infinity, 'after typing it is a real gap')
killTerm('never')
killTerm('sys')

// ============================================================== killTermAndWait
// The delete-transcript path kills the terminal and waits before erasing, so
// that claude's shutdown flush cannot restore what was just deleted. A promise
// that resolves early makes the delete race the flush again.
const disposedBefore = globalThis.__disposed
await killTermAndWait('gone') // an unknown id resolves rather than hanging 3s
assert.strictEqual(globalThis.__disposed, disposedBefore, 'an unknown id registers no listener')

createTerm(fakeWin, 'kaw', { cwd: tmp })
const kawProc = lastSpawn().proc
let settled = false
const waiting = killTermAndWait('kaw').then(() => (settled = true))
await new Promise((r) => setImmediate(r))
assert.strictEqual(settled, false, 'it must not resolve before the pty reports its exit')
kawProc.fireExit(0)
await waiting
assert.strictEqual(settled, true, 'onExit must resolve the wait')
assert.ok(globalThis.__disposed > disposedBefore, 'the exit listener must be disposed')
assert.strictEqual(isLive('kaw'), false, 'the terminal is gone once the wait resolves')

// a shell that ignores the kill must not hang the delete flow forever
createTerm(fakeWin, 'stuck', { cwd: tmp })
const stuckBefore = globalThis.__disposed
const stuckStart = Date.now()
await killTermAndWait('stuck', 20)
assert.ok(Date.now() - stuckStart < 1000, 'the timeout arm must settle quickly')
assert.ok(globalThis.__disposed > stuckBefore, 'the timeout arm must dispose its listener too')

await fs.rm(tmp, { recursive: true, force: true })
console.log('ok — terminal spawn shape, live-terminal list and session accessors')
process.exit(0) // the module's busy-watch interval keeps the loop alive otherwise
