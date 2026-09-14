// Self-check for how an MCP stdio server is spawned. Both call sites have to
// agree — a fix applied to only one of them is the regression this guards.
// Run: node scripts/check-mcp-spawn.mjs
import { buildSync } from 'esbuild'
import { promises as fs } from 'fs'
import { EventEmitter } from 'events'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archo-mcp-'))

// a recording stub for spawn: the MCP handshake is not what is under test, the
// argv/shell flags handed to the child are
const cpStub = path.join(tmp, 'cp-stub.mjs')
await fs.writeFile(
  cpStub,
  `import { EventEmitter } from 'events'
globalThis.__spawns = []
export function spawn(file, args, opts) {
  globalThis.__spawns.push({ file, args, opts })
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.stdin = { write() {}, end() {} }
  child.kill = () => {}
  return child
}
export default { spawn }
`
)

const out = path.join(tmp, 'mcp.mjs')
// the JS API, not the .bin shim — that shim is esbuild.cmd on Windows
buildSync({
  entryPoints: [path.join(root, 'src/main/mcpClient.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  alias: { child_process: cpStub }
})

// the module captures needsShell/shellArgv at load, so each platform needs its
// own instance — the query string is what defeats the ESM module cache
const realPlatform = process.platform
async function loadAs(platform, tag) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
  const mod = await import(`${pathToFileURL(out).href}?p=${tag}`)
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true })
  return mod
}
const posix = await loadAs('darwin', 'posix')
const win = await loadAs('win32', 'win')

const spawns = () => globalThis.__spawns
const reset = () => {
  globalThis.__spawns = []
}
const cfg = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] }

// ==================================================================== testMcp
reset()
let res = await posix.testMcp(cfg, 30) // short timeout: the stub never answers
assert.strictEqual(res.ok, false, 'a server that never answers must not resolve ok')
assert.strictEqual(spawns().length, 1, 'testMcp must spawn exactly once')
let s = spawns()[0]
// POSIX must be byte-identical to a plain spawn — shellArgv is the identity there
assert.strictEqual(s.file, 'npx', 'the command must arrive unquoted on POSIX')
assert.deepStrictEqual(s.args, cfg.args, 'the args must arrive untouched on POSIX')
assert.strictEqual(s.opts.shell, false, 'POSIX must not route the spawn through a shell')
assert.deepStrictEqual(s.opts.stdio, ['pipe', 'pipe', 'pipe'])

// ================================================================ callMcpTool
reset()
res = await posix.callMcpTool(cfg, 'read_file', { path: '/tmp/x' }, 30)
assert.strictEqual(res.ok, false)
assert.strictEqual(spawns().length, 1, 'callMcpTool must spawn exactly once')
const c = spawns()[0]
assert.strictEqual(c.file, 'npx')
assert.deepStrictEqual(c.args, cfg.args)
assert.strictEqual(c.opts.shell, false)
assert.deepStrictEqual(c.opts.stdio, ['pipe', 'pipe', 'pipe'])

// the two call sites must agree — that is the whole point of this check
assert.deepStrictEqual(
  { file: c.file, args: c.args, shell: c.opts.shell },
  { file: s.file, args: s.args, shell: s.opts.shell },
  'testMcp and callMcpTool spawn differently'
)

// ================================================================ Windows shape
// npx/uvx are .cmd shims there: spawn without a shell is ENOENT, and with one
// an argument containing a space must arrive as ONE argument, not two
const winCfg = {
  command: 'C:\\Program Files\\nodejs\\npx.cmd',
  args: ['-y', 'server', 'C:\\My Documents\\notes']
}
for (const [name, call] of [
  ['testMcp', () => win.testMcp(winCfg, 30)],
  ['callMcpTool', () => win.callMcpTool(winCfg, 'x', {}, 30)]
]) {
  reset()
  await call()
  const w = spawns()[0]
  assert.strictEqual(w.opts.shell, true, `${name}: the .cmd shim needs a shell`)
  assert.strictEqual(w.file, '"C:\\Program Files\\nodejs\\npx.cmd"', `${name}: command not quoted`)
  assert.deepStrictEqual(
    w.args,
    ['-y', 'server', '"C:\\My Documents\\notes"'],
    `${name}: an argument with a space would arrive as two`
  )
  assert.strictEqual(w.args.length, 3, `${name}: the argument count must not change`)
}

// ============================================================ the guard clause
// a config with no command never reaches spawn at all
reset()
assert.strictEqual((await posix.testMcp({}, 30)).ok, false)
assert.strictEqual((await posix.callMcpTool({}, 'x', {}, 30)).ok, false)
assert.strictEqual(spawns().length, 0, 'an invalid config must not spawn anything')

await fs.rm(tmp, { recursive: true, force: true })
console.log('ok — MCP stdio spawn shape')
