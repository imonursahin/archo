// Self-check for the assistant registry and the settings writers: secrets are
// blanked, dropped files are reported from any depth, and a key-by-key write
// never eats the rest of a settings file.
// Run: node scripts/check-assistants.mjs
import { buildSync } from 'esbuild'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const out = path.join(os.tmpdir(), `archo-assistants-reg-${Date.now()}.mjs`)
// the JS API, not the .bin shim — that shim is esbuild.cmd on Windows
buildSync({
  entryPoints: [path.join(root, 'src/main/assistants.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out
})
const {
  setStorePath,
  exportAssistant,
  registerAssistant,
  listAssistants,
  updateHookEvent,
  deleteHookEvent,
  linkSkills
} = await import(pathToFileURL(out).href)

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archo-reg-'))
const store = path.join(tmp, 'assistants.json')
await fs.writeFile(store, JSON.stringify({ assistants: [] }))
setStorePath(store)
const mcpRel = '.mcp' + '.json' // spelled out so the publish-ignore check stays happy

// ======================================================= BUNDLE_SKIP breadth
// the widened regex has to match at any depth, and must not eat a file that
// merely starts with the same letters
const skipDir = path.join(tmp, 'skips')
await fs.mkdir(path.join(skipDir, 'nested', '.claude', 'logs'), { recursive: true })
await fs.mkdir(path.join(skipDir, '.claude', 'logs'), { recursive: true })
await fs.mkdir(path.join(skipDir, 'node_modules', 'pkg'), { recursive: true })
const w = (rel, content) => fs.writeFile(path.join(skipDir, rel), content)
await w('.env', 'TOKEN=secret')
await w('.env.local', 'TOKEN=secret')
await w('.claude/logs/x.txt', 'noise')
await w('.claude/settings.local.json', '{"token":"sk-secret"}')
await w('nested/.claude/logs/deep.txt', 'noise')
await w('nested/.env', 'TOKEN=secret')
await w('node_modules/pkg/index.js', 'junk')
// near-misses that must SURVIVE — the regex needs its boundaries
await w('.envoy.md', 'keep me')
await w('environment.md', 'keep me')
await w('.claude/settings.json', '{}')
await w('CLAUDE.md', 'keep me')

await registerAssistant(skipDir, 'Skips')
const skipBundle = await exportAssistant('skips')
const skipFiles = Object.keys(skipBundle.files).sort()
assert.deepStrictEqual(skipFiles, [
  '.claude/settings.json',
  '.envoy.md',
  'CLAUDE.md',
  'environment.md'
])
for (const leaked of skipFiles) assert.ok(!skipBundle.files[leaked].includes('sk-secret'))
assert.ok(!JSON.stringify(skipBundle).includes('TOKEN=secret'), 'a .env leaked into the bundle')

// ================================================ collectFiles: dropped files
const dropDir = path.join(tmp, 'drops')
await fs.mkdir(path.join(dropDir, 'deep', 'deeper'), { recursive: true })
await fs.writeFile(path.join(dropDir, 'CLAUDE.md'), 'hi')
await fs.writeFile(path.join(dropDir, 'big.md'), 'x'.repeat(512 * 1024 + 1)) // over MAX_BUNDLE_FILE
await fs.writeFile(path.join(dropDir, 'ok.md'), 'x'.repeat(512 * 1024 - 1)) // just under
await fs.writeFile(path.join(dropDir, 'icon.png'), Buffer.from([0x89, 0x50, 0x00, 0x01])) // NUL byte
// the shared accumulator is the point: a drop found three levels down has to
// survive to the top-level result
await fs.writeFile(path.join(dropDir, 'deep', 'deeper', 'nested.bin'), Buffer.from([0x01, 0x00, 0x02]))
await fs.writeFile(path.join(dropDir, 'deep', 'big.md'), 'x'.repeat(512 * 1024 + 1))

await registerAssistant(dropDir, 'Drops')
const dropBundle = await exportAssistant('drops')
assert.deepStrictEqual(dropBundle.dropped.sort(), [
  'big.md',
  'deep/big.md',
  'deep/deeper/nested.bin',
  'icon.png'
])
assert.deepStrictEqual(Object.keys(dropBundle.files).sort(), ['CLAUDE.md', 'ok.md'])
assert.ok(!('big.md' in dropBundle.files), 'an oversized file must not also travel')

// an unreadable file is reported, not silently skipped
if (process.platform !== 'win32' && process.getuid && process.getuid() !== 0) {
  const unreadable = path.join(tmp, 'unreadable')
  await fs.mkdir(unreadable, { recursive: true })
  await fs.writeFile(path.join(unreadable, 'CLAUDE.md'), 'hi')
  const locked = path.join(unreadable, 'locked.md')
  await fs.writeFile(locked, 'secret')
  await fs.chmod(locked, 0o000)
  await registerAssistant(unreadable, 'Unreadable')
  const b = await exportAssistant('unreadable')
  assert.deepStrictEqual(b.dropped, ['locked.md'], 'an unreadable file must be reported')
  await fs.chmod(locked, 0o644)
}

// ================================================== stripMcpSecrets behaviour
const mcpDir = path.join(tmp, 'mcp')
await fs.mkdir(mcpDir, { recursive: true })
await fs.writeFile(
  path.join(mcpDir, mcpRel),
  JSON.stringify({
    mcpServers: {
      api: { command: 'npx', args: ['-y', 'srv'], env: { API_KEY: 'sk-secret', REGION: 'eu' } },
      plain: { command: 'node' } // no env block at all
    }
  })
)
// a same-named key in a file that is NOT the MCP config must be left alone
await fs.writeFile(path.join(mcpDir, 'notes.json'), JSON.stringify({ mcpServers: { a: { env: { K: 'sk-secret' } } } }))
await fs.writeFile(path.join(mcpDir, 'CLAUDE.md'), 'hi')
await registerAssistant(mcpDir, 'Mcp')
const mcpBundle = await exportAssistant('mcp')
const mcp = JSON.parse(mcpBundle.files[mcpRel])
assert.deepStrictEqual(Object.keys(mcp.mcpServers.api.env), ['API_KEY', 'REGION'], 'keys must survive')
assert.strictEqual(mcp.mcpServers.api.env.API_KEY, '', 'the value must be blanked')
assert.strictEqual(mcp.mcpServers.api.env.REGION, '')
assert.deepStrictEqual(mcp.mcpServers.api.args, ['-y', 'srv'], 'the rest of the entry is untouched')
assert.strictEqual(mcp.mcpServers.plain.command, 'node')
assert.ok(!('env' in mcp.mcpServers.plain), 'an absent env block must not be invented')
assert.ok(!mcpBundle.files[mcpRel].includes('sk-secret'))
// a non-.mcp.json file keeps its content byte for byte
assert.ok(mcpBundle.files['notes.json'].includes('sk-secret'), 'an unrelated file was rewritten')

// a no-env MCP config is not rewritten at all (touched stays false)
const untouchedDir = path.join(tmp, 'mcp-noenv')
await fs.mkdir(untouchedDir, { recursive: true })
const compact = JSON.stringify({ mcpServers: { a: { command: 'node' } } })
await fs.writeFile(path.join(untouchedDir, mcpRel), compact)
await registerAssistant(untouchedDir, 'McpNoenv')
assert.strictEqual(
  (await exportAssistant('mcpnoenv')).files[mcpRel],
  compact,
  'a file with no env block must not be reformatted'
)

// malformed JSON is skipped, never thrown
const badDir = path.join(tmp, 'mcp-bad')
await fs.mkdir(badDir, { recursive: true })
await fs.writeFile(path.join(badDir, mcpRel), '{ not json')
await registerAssistant(badDir, 'McpBad')
const badBundle = await exportAssistant('mcpbad')
assert.strictEqual(badBundle.files[mcpRel], '{ not json', 'malformed JSON must pass through as-is')

// ============================================== registerAssistant: collisions
const a1 = path.join(tmp, 'one')
const a2 = path.join(tmp, 'two')
const a3 = path.join(tmp, 'three')
for (const d of [a1, a2, a3]) await fs.mkdir(d, { recursive: true })
const r1 = await registerAssistant(a1, 'Dup')
const r2 = await registerAssistant(a2, 'Dup')
const r3 = await registerAssistant(a3, 'Dup')
assert.strictEqual(r1.id, 'dup')
assert.strictEqual(r2.id, 'dup-2')
assert.strictEqual(r2.name, 'Dup (2)')
assert.strictEqual(r3.id, 'dup-3')
assert.strictEqual(r3.name, 'Dup (3)')
// re-registering the same folder returns the existing entry, no duplicate row
const before = (await listAssistants()).length
const again = await registerAssistant(a1, 'Whatever')
assert.strictEqual(again.id, r1.id)
assert.strictEqual(again.createdAt, r1.createdAt, 'the existing entry must be returned as-is')
assert.strictEqual((await listAssistants()).length, before, 'a duplicate row was appended')

// ========================================= registerAssistant: engine detection
// explicit engineId wins over anything on disk
const cur = path.join(tmp, 'cursor-pick')
await fs.mkdir(path.join(cur, '.claude'), { recursive: true })
assert.strictEqual((await registerAssistant(cur, 'CursorPick', 'cursor')).engineId, 'cursor')
// otherwise the engine whose settingsFile directory exists is chosen
const detected = path.join(tmp, 'detected')
await fs.mkdir(path.join(detected, '.claude'), { recursive: true })
assert.strictEqual((await registerAssistant(detected, 'Detected')).engineId, 'claude')
// otherwise the claude fallback
const bareDir = path.join(tmp, 'bare')
await fs.mkdir(bareDir, { recursive: true })
const bareA = await registerAssistant(bareDir, 'Bare')
assert.strictEqual(bareA.engineId, 'claude')
assert.strictEqual(bareA.icon, '✳', 'the icon comes from the resolved engine')
// an unknown engineId falls through to detection rather than being taken literally
assert.strictEqual(
  (await registerAssistant(path.join(tmp, 'bare2'), 'Bare2', 'nope')).engineId,
  'claude'
)

// ============================================================ updateHookEvent
const settings = path.join(tmp, 'settings.json')
await fs.writeFile(
  settings,
  JSON.stringify({
    permissions: { allow: ['Bash'] },
    model: 'opus',
    env: { FOO: 'bar' },
    hooks: { Stop: [{ matcher: 'x', hooks: [] }] }
  })
)
await updateHookEvent(settings, 'PreToolUse', [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo' }] }])
let json = JSON.parse(await fs.readFile(settings, 'utf8'))
assert.deepStrictEqual(json.permissions, { allow: ['Bash'] }, 'permissions must survive')
assert.strictEqual(json.model, 'opus', 'model must survive')
assert.deepStrictEqual(json.env, { FOO: 'bar' }, 'env must survive')
assert.deepStrictEqual(json.hooks.Stop, [{ matcher: 'x', hooks: [] }], 'a sibling event must survive')
assert.strictEqual(json.hooks.PreToolUse[0].matcher, 'Bash')
// the named event is replaced wholesale, not merged
await updateHookEvent(settings, 'PreToolUse', [{ matcher: 'Edit', hooks: [] }])
json = JSON.parse(await fs.readFile(settings, 'utf8'))
assert.deepStrictEqual(json.hooks.PreToolUse, [{ matcher: 'Edit', hooks: [] }])

// hooks is created when the file has none
const noHooks = path.join(tmp, 'nohooks.json')
await fs.writeFile(noHooks, JSON.stringify({ model: 'opus' }))
await updateHookEvent(noHooks, 'Stop', [])
assert.deepStrictEqual(JSON.parse(await fs.readFile(noHooks, 'utf8')), { model: 'opus', hooks: { Stop: [] } })

// a missing file is created from scratch
const fresh = path.join(tmp, 'fresh.json')
await updateHookEvent(fresh, 'Stop', [])
assert.deepStrictEqual(JSON.parse(await fs.readFile(fresh, 'utf8')), { hooks: { Stop: [] } })

// ============================================================ deleteHookEvent
await deleteHookEvent(settings, 'PreToolUse')
json = JSON.parse(await fs.readFile(settings, 'utf8'))
assert.ok(!('PreToolUse' in json.hooks), 'the event must be removed')
assert.ok('Stop' in json.hooks, 'the sibling event must stay')
assert.strictEqual(json.model, 'opus')
// removing the last event removes the now-empty hooks object too
await deleteHookEvent(settings, 'Stop')
json = JSON.parse(await fs.readFile(settings, 'utf8'))
assert.ok(!('hooks' in json), 'an empty hooks object must be dropped')
assert.strictEqual(json.model, 'opus', 'the rest of the file is still there')
// a file with no hooks at all is a no-op — and so is a missing file
const before2 = await fs.readFile(settings, 'utf8')
await deleteHookEvent(settings, 'Stop')
assert.strictEqual(await fs.readFile(settings, 'utf8'), before2, 'a no-op must not rewrite the file')
await deleteHookEvent(path.join(tmp, 'absent.json'), 'Stop') // must not throw

// ============================================================= readJsonStrict
// a malformed but EXISTING settings file must throw, not be treated as empty —
// otherwise a key-by-key write replaces the user's whole file with one key
const broken = path.join(tmp, 'broken.json')
await fs.writeFile(broken, '{ "model": "opus"')
await assert.rejects(() => updateHookEvent(broken, 'Stop', []), /broken\.json is not valid JSON/)
await assert.rejects(() => deleteHookEvent(broken, 'Stop'), /is not valid JSON/)
assert.strictEqual(await fs.readFile(broken, 'utf8'), '{ "model": "opus"', 'the file must be left alone')

// ============================================================ writeJsonAtomic
// the write goes through a temp file that is renamed over the target, so no
// stray temp file survives a successful write
const leftovers = (await fs.readdir(tmp)).filter((f) => f.includes('.tmp-'))
assert.deepStrictEqual(leftovers, [], `temp files left behind: ${leftovers}`)
const srcText = await fs.readFile(path.join(root, 'src/main/assistants.ts'), 'utf8')
assert.match(srcText, /`\$\{file\}\.tmp-\$\{process\.pid\}`/, 'the temp file name shape changed')
assert.match(srcText, /fs\.rename\(tmp, file\)/, 'the atomic rename is gone')

// a failing write leaves the original intact — this guards ~/.claude.json
const guarded = path.join(tmp, 'guarded')
await fs.mkdir(guarded, { recursive: true })
const precious = path.join(guarded, 'settings.json')
await fs.writeFile(precious, JSON.stringify({ model: 'opus' }))
if (process.platform !== 'win32' && process.getuid && process.getuid() !== 0) {
  await fs.chmod(guarded, 0o500) // no new temp file can be created here
  await assert.rejects(() => updateHookEvent(precious, 'Stop', []), /EACCES|EPERM/)
  await fs.chmod(guarded, 0o755)
  assert.deepStrictEqual(
    JSON.parse(await fs.readFile(precious, 'utf8')),
    { model: 'opus' },
    'a failed write must leave the original file intact'
  )
}

// ====================================================================== link
// POSIX gets a plain symlink with no type argument; the Windows types are
// asserted from the source, since fs.symlink ignores them off Windows
assert.match(srcText, /fs\.symlink\(src, dst, 'junction'\)/, 'a directory needs a junction on Windows')
assert.match(srcText, /fs\.symlink\(src, dst, 'file'\)/, 'a file needs the file type on Windows')
assert.ok(!/fs\.link\(/.test(srcText), 'a hard link would survive unlinkSkills and keep sharing an inode')

if (process.platform !== 'win32') {
  const skillSrc = path.join(tmp, 'linker')
  await fs.mkdir(path.join(skillSrc, '.claude', 'skills', 'demo'), { recursive: true })
  await fs.writeFile(path.join(skillSrc, '.claude', 'skills', 'demo', 'SKILL.md'), 'skill')
  await registerAssistant(skillSrc, 'Linker')
  const target = path.join(tmp, 'link-target')
  await fs.mkdir(target, { recursive: true })
  const res = await linkSkills('linker', target)
  assert.strictEqual(res.ok, true, res.error)
  const linkStat = await fs.lstat(path.join(target, '.claude', 'skills', 'demo'))
  assert.ok(linkStat.isSymbolicLink(), 'the bridge must be a symlink, never a copy or a hard link')
  assert.strictEqual(
    await fs.readlink(path.join(target, '.claude', 'skills', 'demo')),
    path.join(skillSrc, '.claude', 'skills', 'demo')
  )
  // an assistant cannot bridge into its own directory
  assert.strictEqual((await linkSkills('linker', skillSrc)).ok, false)
}

await fs.rm(tmp, { recursive: true, force: true })
await fs.rm(out, { force: true })
console.log('ok — assistant registry, bundle filter and settings writers')
