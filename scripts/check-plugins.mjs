// Self-check for the `claude plugin` CLI wrapper: every call carries its cwd,
// a failure becomes a result object instead of a rejection, and the argv shapes
// are the ones the CLI actually expects.
// Run: node scripts/check-plugins.mjs
import { buildSync } from 'esbuild'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archo-plugins-'))

// the CLI is stubbed: what is under test is the argv, the cwd and the error
// shape, not Claude Code's own plugin store
const cpStub = path.join(tmp, 'cp-stub.mjs')
await fs.writeFile(
  cpStub,
  `import { promisify } from 'util'
globalThis.__calls = []
globalThis.__reply = () => ({ stdout: '[]', stderr: '' })
export function execFile() {}
execFile[promisify.custom] = async (file, args, opts) => {
  globalThis.__calls.push({ file, args, opts })
  const r = globalThis.__reply(args)
  if (r instanceof Error) throw r
  return r
}
export default { execFile }
`
)

const out = path.join(tmp, 'plugins.mjs')
// the JS API, not the .bin shim — that shim is esbuild.cmd on Windows
buildSync({
  entryPoints: [path.join(root, 'src/main/plugins.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  alias: { child_process: cpStub }
})
const mod = await import(pathToFileURL(out).href)
const {
  listPlugins,
  listMarketplaces,
  pluginInstall,
  pluginUninstall,
  pluginUpdate,
  pluginEnable,
  pluginDisable,
  marketplaceAdd,
  marketplaceRemove,
  marketplaceUpdate
} = mod

const calls = () => globalThis.__calls
const reset = (reply) => {
  globalThis.__calls = []
  globalThis.__reply = reply || (() => ({ stdout: '[]', stderr: '' }))
}
const argvOf = (i) => calls()[i].args
const fail = (props) => Object.assign(new Error(props.message || 'boom'), props)

// ==================================================================== parseJson
// malformed output must not take the whole call down — the CLI may print a
// warning line before its JSON
reset(() => ({ stdout: 'warning: something\n[{"id":"a"}]', stderr: '' }))
let r = await listPlugins('/work')
assert.strictEqual(r.ok, true, 'a warning line must not fail the call')
assert.deepStrictEqual(r.installed, [], 'unparseable output falls back to the empty list')

reset(() => ({ stdout: '[{"id":"a","version":"1.0"}]', stderr: '' }))
r = await listPlugins('/work')
assert.strictEqual(r.installed[0].version, '1.0', 'valid JSON must actually parse')

// ================================================================= listPlugins
reset((args) =>
  args.includes('--available')
    ? { stdout: JSON.stringify([{ id: 'a' }, { id: 'b' }, { id: 'c' }]), stderr: '' }
    : { stdout: JSON.stringify([{ id: 'a' }, { id: 'b' }]), stderr: '' }
)
r = await listPlugins('/work')
assert.strictEqual(r.ok, true)
assert.ok(r.installed.every((p) => p.installed === true), 'installed entries must be flagged')
assert.deepStrictEqual(
  r.available.map((p) => p.id),
  ['c'],
  'an already-installed id must not appear twice'
)
assert.ok(r.available.every((p) => p.installed === false))

// the --available call failing falls back to '[]' instead of failing the list
reset((args) =>
  args.includes('--available')
    ? fail({ stderr: 'no marketplace configured' })
    : { stdout: JSON.stringify([{ id: 'a' }]), stderr: '' }
)
r = await listPlugins('/work')
assert.strictEqual(r.ok, true, 'a failing --available must not fail the whole list')
assert.deepStrictEqual(r.installed.map((p) => p.id), ['a'])
assert.deepStrictEqual(r.available, [])

// =========================================================== listPlugins errors
// a failing `plugin list` resolves to a result object, never a rejected promise
reset(() => fail({ stderr: 'claude: not found', message: 'Command failed' }))
r = await listPlugins('/work')
assert.deepStrictEqual(r, {
  ok: false,
  error: 'claude: not found',
  installed: [],
  available: []
})
// stderr is preferred over message; message is the fallback
reset(() => fail({ message: 'spawn ENOENT' }))
r = await listPlugins('/work')
assert.strictEqual(r.error, 'spawn ENOENT')
assert.strictEqual(r.ok, false)

// listMarketplaces swallows a failure into an empty list
reset(() => fail({ stderr: 'nope' }))
assert.deepStrictEqual(await listMarketplaces('/work'), [])

// ========================================================================= act
reset()
assert.deepStrictEqual(await pluginInstall('/work', 'x'), { ok: true })
reset(() => fail({ stderr: 'already installed', message: 'Command failed' }))
assert.deepStrictEqual(await pluginInstall('/work', 'x'), { ok: false, error: 'already installed' })
reset(() => fail({ message: 'Command failed' }))
assert.deepStrictEqual(await pluginUninstall('/work', 'x'), { ok: false, error: 'Command failed' })

// ============================================================== wrapper argvs
reset()
await pluginInstall('/work', 'id1')
await pluginUninstall('/work', 'id1')
await pluginUpdate('/work', 'id1')
await pluginEnable('/work', 'id1')
await pluginDisable('/work', 'id1')
await marketplaceAdd('/work', 'owner/repo')
await marketplaceRemove('/work', 'mp')
assert.deepStrictEqual(argvOf(0), ['plugin', 'install', 'id1'])
assert.deepStrictEqual(argvOf(1), ['plugin', 'uninstall', 'id1'])
assert.deepStrictEqual(argvOf(2), ['plugin', 'update', 'id1'])
assert.deepStrictEqual(argvOf(3), ['plugin', 'enable', 'id1'])
assert.deepStrictEqual(argvOf(4), ['plugin', 'disable', 'id1'])
assert.deepStrictEqual(argvOf(5), ['plugin', 'marketplace', 'add', 'owner/repo'])
assert.deepStrictEqual(argvOf(6), ['plugin', 'marketplace', 'remove', 'mp'])

// marketplaceUpdate is the only wrapper with a branch
reset()
await marketplaceUpdate('/work', 'mp')
await marketplaceUpdate('/work')
assert.deepStrictEqual(argvOf(0), ['plugin', 'marketplace', 'update', 'mp'])
assert.deepStrictEqual(argvOf(1), ['plugin', 'marketplace', 'update'])

// ============================================================ the claude() call
// project-scoped plugins resolve by cwd, so a dropped cwd silently lists the
// wrong plugin set
const shellenvOut = path.join(tmp, 'shellenv.mjs')
buildSync({
  entryPoints: [path.join(root, 'src/main/shellenv.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: shellenvOut
})
const { shellArgv, needsShell, pathFloor } = await import(pathToFileURL(shellenvOut).href)

reset()
await listPlugins('/some/project')
await marketplaceUpdate('/other/project')
for (const c of calls()) {
  assert.strictEqual(c.file, 'claude')
  assert.ok(c.opts.cwd, 'every CLI invocation must carry a cwd')
  assert.strictEqual(c.opts.shell, needsShell, 'the .cmd shim needs a shell on Windows only')
  assert.deepStrictEqual(c.args, shellArgv(c.args), 'the argv must be shellArgv-quoted')
  for (const entry of pathFloor())
    assert.ok(c.opts.env.PATH.split(path.delimiter).includes(entry), `PATH floor lost ${entry}`)
}
assert.strictEqual(calls()[0].opts.cwd, '/some/project')
assert.strictEqual(calls()[calls().length - 1].opts.cwd, '/other/project')

await fs.rm(tmp, { recursive: true, force: true })
console.log('ok — plugin CLI wrapper')
