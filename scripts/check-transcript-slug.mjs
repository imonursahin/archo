// Self-check that transcript lookups resolve their folder through projectSlug.
// A wrong slug finds nothing and reports empty usage silently, so only a test
// catches it.
// Run: node scripts/check-transcript-slug.mjs
import { buildSync } from 'esbuild'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archo-slug-'))

const osStub = path.join(tmp, 'os-stub.mjs')
await fs.writeFile(
  osStub,
  `import { createRequire } from 'module'
// createRequire, not \`import from 'os'\` — that import would be aliased back to
// this same stub and resolve to itself
const real = createRequire(import.meta.url)('os')
export const homedir = () => globalThis.__home || real.homedir()
export default { ...real, homedir }
`
)

const build = (entry, name) => {
  const out = path.join(tmp, name)
  // the JS API, not the .bin shim — that shim is esbuild.cmd on Windows
  buildSync({
    entryPoints: [path.join(root, entry)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: out,
    alias: { os: osStub }
  })
  return pathToFileURL(out).href
}

const home = path.join(tmp, 'home')
globalThis.__home = home
const projects = path.join(home, '.claude', 'projects')
await fs.mkdir(projects, { recursive: true })

const { detectClaudeSession, detectClaudeSessions } = await import(build('src/main/claude.ts', 'claude.mjs'))
const { sessionUsage } = await import(build('src/main/usage.ts', 'usage.mjs'))
const { projectSlug } = await import(build('src/main/shellenv.ts', 'shellenv.mjs'))

// a transcript is written where Claude Code would put it: one folder per cwd,
// named by the slug
async function seed(cwd, sessionId, lines) {
  const dir = path.join(projects, projectSlug(cwd))
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, `${sessionId}.jsonl`), lines.join('\n'))
  return dir
}

const cwd = '/Users/onur/my.project'
const line = (ts, cost) =>
  JSON.stringify({
    timestamp: new Date(ts).toISOString(),
    type: 'assistant',
    costUSD: cost,
    message: {
      role: 'assistant',
      model: 'claude-opus-4',
      usage: { input_tokens: 100, output_tokens: 20 }
    }
  })
await seed(cwd, 'sess-1', [line(Date.now() - 60000, 0.01), line(Date.now(), 0.02)])

// ============================================== the slug is the folder name
assert.strictEqual(projectSlug(cwd), '-Users-onur-my-project')
assert.ok(
  (await fs.readdir(projects)).includes('-Users-onur-my-project'),
  'precondition: the fixture folder is the slug'
)

// ====================================================== detectClaudeSession
assert.strictEqual(
  await detectClaudeSession(cwd, Date.now() - 120000),
  'sess-1',
  'the transcript dir must be resolved through projectSlug'
)
// a cwd that slugs to a different folder finds nothing rather than erroring
assert.strictEqual(await detectClaudeSession('/Users/onur/other', Date.now() - 120000), null)
// a session older than the window is not claimed
assert.strictEqual(await detectClaudeSession(cwd, Date.now() + 600000), null)

// ===================================================== detectClaudeSessions
const found = await detectClaudeSessions(cwd, Date.now() - 120000)
assert.strictEqual(found.length, 1)
assert.strictEqual(found[0].id, 'sess-1')
assert.ok(found[0].mtime > 0 && found[0].btime > 0)
assert.deepStrictEqual(await detectClaudeSessions('/Users/onur/other', 0), [])

// =============================================================== sessionUsage
const usage = await sessionUsage(cwd, 'sess-1')
assert.strictEqual(usage.ok, true, 'the .jsonl path must be built from projectSlug')
assert.ok(usage.cost > 0, 'the transcript was found but not read')
assert.ok(usage.messages > 0)
// the silent-failure shape: a wrong cwd returns empty usage, it does not throw
const missing = await sessionUsage('/Users/onur/other', 'sess-1')
assert.strictEqual(missing.ok, false)
assert.strictEqual(missing.cost, 0)
assert.strictEqual(missing.messages, 0)
assert.strictEqual((await sessionUsage('', 'sess-1')).ok, false)
assert.strictEqual((await sessionUsage(cwd, '')).ok, false)

// ============================================ Backward compatibility on POSIX
// the refactor replaced an inline replace(/[/.]/g,'-') at each call site; on a
// colon-free POSIX path the answer must be identical, so existing transcript
// folders keep resolving
for (const p of ['/Users/onur/proj', '/a/b.c/d', '/Users/onur/AgentStudio/assistants/ai-engineer']) {
  assert.strictEqual(projectSlug(p), p.replace(/[/.]/g, '-'), `slug drifted for ${p}`)
  const id = 'compat'
  await seed(p, id, [line(Date.now(), 0.5)])
  assert.strictEqual(await detectClaudeSession(p, Date.now() - 60000), id, `lookup broke for ${p}`)
  assert.strictEqual((await sessionUsage(p, id)).ok, true, `usage broke for ${p}`)
}

// a Windows-shaped cwd flattens its drive colon and backslashes too
const winCwd = 'C:\\Users\\x\\proj'
assert.strictEqual(projectSlug(winCwd), 'C--Users-x-proj')
await seed(winCwd, 'win-1', [line(Date.now(), 0.1)])
assert.strictEqual(await detectClaudeSession(winCwd, Date.now() - 60000), 'win-1')
assert.strictEqual((await sessionUsage(winCwd, 'win-1')).ok, true)

await fs.rm(tmp, { recursive: true, force: true })
console.log('ok — transcript folder resolution')
