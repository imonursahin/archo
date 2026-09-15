// Self-check for deleting a Claude conversation — the one place Archo removes a
// file from Claude's own store, so it has to erase exactly the conversation the
// user pointed at and nothing else. HOME is redirected to a temp dir before the
// module is loaded, so the real ~/.claude is never touched.
// Run: node scripts/check-claude-store.mjs
import { buildSync } from 'esbuild'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'archo-claude-'))
process.env.HOME = home
process.env.USERPROFILE = home // os.homedir() reads this one on Windows
assert.strictEqual(
  os.homedir(),
  home,
  'refusing to run: the home directory was not redirected, this check deletes files'
)

const out = path.join(os.tmpdir(), `archo-claude-${Date.now()}.mjs`)
buildSync({
  entryPoints: [path.join(root, 'src/main/claude.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out
})
const { deleteTranscript, transcriptExists } = await import(pathToFileURL(out).href)

const projects = path.join(home, '.claude', 'projects')
const mine = path.join(projects, '-Users-me-work')
const other = path.join(projects, '-Users-me-elsewhere')
await fs.mkdir(mine, { recursive: true })
await fs.mkdir(other, { recursive: true })

const id = 'abc123-def456'
await fs.writeFile(path.join(mine, `${id}.jsonl`), '{"type":"user"}\n')
await fs.writeFile(path.join(mine, 'keep-me.jsonl'), '{"type":"user"}\n')
await fs.writeFile(path.join(other, 'sibling.jsonl'), '{"type":"user"}\n')
// the same id under a second project: the terminal's cwd is not necessarily
// where claude ran, so the search is deliberately unscoped
await fs.writeFile(path.join(other, `${id}.jsonl`), '{"type":"user"}\n')

assert.strictEqual(await transcriptExists(id), true, 'precondition: the conversation is there')
assert.deepStrictEqual(
  await deleteTranscript(id),
  { removed: 2, failed: 0 },
  'both copies of the conversation are removed'
)
assert.strictEqual(await transcriptExists(id), false, 'the conversation must be gone')
for (const survivor of [path.join(mine, 'keep-me.jsonl'), path.join(other, 'sibling.jsonl')])
  assert.ok(await fs.stat(survivor), `${survivor} must survive`)

// a conversation that is not there is not an error, just nothing deleted
assert.deepStrictEqual(
  await deleteTranscript('no-such-id'),
  { removed: 0, failed: 0 },
  'a missing conversation is not a failure'
)

// an id is a file name, never a path — anything else is refused before any rm
await fs.writeFile(path.join(projects, 'outside.jsonl'), 'x')
for (const hostile of ['../outside', 'a/b', '..', '', 'a b', 'a.jsonl/../../b'])
  assert.deepStrictEqual(
    await deleteTranscript(hostile),
    { removed: 0, failed: 0 },
    `"${hostile}" must be refused, not resolved`
  )
assert.ok(await fs.stat(path.join(projects, 'outside.jsonl')), 'nothing outside a project dir is touched')

// ------------------------------------------------------------ memory wiping
// The memory lives under the same store, keyed by the assistant's folder, so a
// clear must empty that folder and leave every other assistant's memory alone.
const assistantsOut = path.join(os.tmpdir(), `archo-assistants-mem-${Date.now()}.mjs`)
buildSync({
  entryPoints: [path.join(root, 'src/main/assistants.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: assistantsOut
})
const { setStorePath, clearMemories } = await import(pathToFileURL(assistantsOut).href)

const baseDir = path.join(home, 'AgentStudio', 'assistants', 'demo')
const otherDir = path.join(home, 'AgentStudio', 'assistants', 'other')
const slug = (dir) => dir.replace(/[/\\.:]/g, '-')
const mineMem = path.join(projects, slug(baseDir), 'memory')
const otherMem = path.join(projects, slug(otherDir), 'memory')
await fs.mkdir(mineMem, { recursive: true })
await fs.mkdir(otherMem, { recursive: true })
await fs.writeFile(path.join(mineMem, 'MEMORY.md'), '- [A](a.md)\n')
await fs.writeFile(path.join(mineMem, 'a.md'), 'remembered thing')
await fs.writeFile(path.join(mineMem, 'notes.txt'), 'not a memory file')
await fs.writeFile(path.join(otherMem, 'b.md'), 'another assistant remembers this')

const store = path.join(home, 'assistants.json')
await fs.writeFile(
  store,
  JSON.stringify({
    assistants: [
      { id: 'demo', name: 'Demo', icon: '🤖', engineId: 'claude', baseDir, createdAt: 1 },
      { id: 'other', name: 'Other', icon: '🤖', engineId: 'claude', baseDir: otherDir, createdAt: 2 },
      { id: 'codex', name: 'Codex', icon: '🤖', engineId: 'codex', baseDir, createdAt: 3 }
    ]
  })
)
setStorePath(store)

const cleared = await clearMemories('demo')
assert.strictEqual(cleared.removed, 2, 'both memory files go, index included')
assert.ok(cleared.bytes > 0, 'the freed size is reported')
assert.strictEqual(cleared.failed, 0, 'nothing was left behind')
assert.deepStrictEqual(
  (await fs.readdir(mineMem)).sort(),
  ['notes.txt'],
  'only .md memory files are removed'
)
assert.deepStrictEqual(await fs.readdir(otherMem), ['b.md'], "another assistant's memory survives")
assert.deepStrictEqual(
  await clearMemories('demo'),
  { removed: 0, bytes: 0, failed: 0 },
  'clearing an already empty memory is not an error'
)
assert.deepStrictEqual(
  await clearMemories('no-such-assistant'),
  { removed: 0, bytes: 0, failed: 0 },
  'an unknown assistant deletes nothing'
)
// memory is a Claude concept: another engine's assistant has none to clear, and
// this one shares a baseDir, so a missing guard would wipe the neighbour's files
await fs.writeFile(path.join(mineMem, 'back.md'), 'written again')
assert.deepStrictEqual(
  await clearMemories('codex'),
  { removed: 0, bytes: 0, failed: 0 },
  'a non-claude assistant has no memory to clear'
)
assert.deepStrictEqual(
  (await fs.readdir(mineMem)).sort(),
  ['back.md', 'notes.txt'],
  'and it deleted nothing'
)

// a transcript that cannot be removed is counted, not reported as absent.
// A read-only directory denies deletion only to an ordinary user on a POSIX
// filesystem, so the case is skipped elsewhere rather than asserted falsely.
if (process.platform !== 'win32' && process.getuid && process.getuid() !== 0) {
  const locked = path.join(projects, '-locked-project')
  await fs.mkdir(locked, { recursive: true })
  await fs.writeFile(path.join(locked, 'stuck-id.jsonl'), '{}')
  await fs.chmod(locked, 0o500)
  const lockedResult = await deleteTranscript('stuck-id')
  await fs.chmod(locked, 0o700)
  assert.strictEqual(lockedResult.removed, 0, 'a locked transcript is not removed')
  assert.strictEqual(lockedResult.failed, 1, 'and the failure is counted, not silently ignored')
}

// F3: a stray file among the project folders is "not here", not a failure —
// otherwise a successful delete would report that it could not be done
await fs.writeFile(path.join(projects, 'stray.jsonl'), 'x')
await fs.mkdir(path.join(projects, '-another-project'), { recursive: true })
await fs.writeFile(path.join(projects, '-another-project', 'plain-id.jsonl'), '{}')
assert.deepStrictEqual(
  await deleteTranscript('plain-id'),
  { removed: 1, failed: 0 },
  'a stray file next to the project folders must not read as a failed delete'
)

await fs.rm(home, { recursive: true, force: true })
await fs.rm(out, { force: true })
await fs.rm(assistantsOut, { force: true })
console.log('ok — conversation deletion and memory wiping hit exactly their target')
