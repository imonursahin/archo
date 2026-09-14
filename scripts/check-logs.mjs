// Self-check for terminal log accounting and pruning: an unreadable session
// store must never turn every live log into an orphan, and a terminal that is
// still recording keeps its file.
// Run: node scripts/check-logs.mjs
import { buildSync } from 'esbuild'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const out = path.join(os.tmpdir(), `archo-sessions-${Date.now()}.mjs`)
// the JS API, not the .bin shim — that shim is esbuild.cmd on Windows
buildSync({
  entryPoints: [path.join(root, 'src/main/sessions.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out
})
const { setPaths, logStats, pruneLogs, listSessions } = await import(pathToFileURL(out).href)

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archo-logs-'))
const store = path.join(tmp, 'sessions.json')
const logs = path.join(tmp, 'logs')
setPaths(store, logs)

const DAY = 24 * 60 * 60 * 1000
async function writeLog(sessionId, termId, size, ageDays) {
  const dir = path.join(logs, sessionId)
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `${termId}.jsonl`)
  await fs.writeFile(file, 'x'.repeat(size))
  const when = new Date(Date.now() - ageDays * DAY)
  await fs.utimes(file, when, when)
  return file
}
const writeStore = (sessions) => fs.writeFile(store, JSON.stringify({ sessions }))
const reset = async () => fs.rm(logs, { recursive: true, force: true })

// ================================================= loadOrNull's three states
// missing store, malformed store and an empty store are three different things
await fs.rm(store, { force: true })
assert.deepStrictEqual(await listSessions('a'), [], 'load() must collapse null to [] for callers')
await fs.writeFile(store, '{ not json')
assert.deepStrictEqual(await listSessions('a'), [], 'a malformed store must not throw at callers')
await fs.writeFile(store, JSON.stringify({ version: 1 })) // valid JSON, no sessions array
assert.deepStrictEqual(await listSessions('a'), [], 'a store with no sessions array means []')

// ===================================================== logStats: sums and age
await reset()
await writeStore([{ id: 's1', assistantId: 'a', name: 'one' }])
await writeLog('s1', 't1', 100, 0)
await writeLog('s1', 't2', 50, 3)
await writeLog('s1', 't3', 25, 10) // the oldest

let stats = await logStats()
assert.strictEqual(stats.bytes, 175, 'bytes must sum every file under every terminal dir')
assert.strictEqual(stats.files, 3)
assert.ok(stats.oldestMs >= 10 * DAY && stats.oldestMs < 11 * DAY, 'oldestMs is the MAX age')
assert.strictEqual(stats.orphanBytes, 0, 'a live session owns its logs')

// a missing logsDir answers with the zeroed struct instead of throwing
await reset()
assert.deepStrictEqual(await logStats(), { bytes: 0, files: 0, orphanBytes: 0, oldestMs: 0 })

// =============================================== logStats: orphan accounting
await reset()
await writeStore([{ id: 's1', assistantId: 'a', name: 'one' }])
await writeLog('s1', 't1', 100, 0)
await writeLog('gone', 't9', 40, 0) // no such session in the store
stats = await logStats()
assert.strictEqual(stats.bytes, 140)
assert.strictEqual(stats.orphanBytes, 40, 'a log dir with no session is an orphan')

// the critical case: an unreadable store means "unknown", not "all orphaned"
await fs.writeFile(store, '{ corrupt')
stats = await logStats()
assert.strictEqual(stats.bytes, 140, 'the byte total is still reported')
assert.strictEqual(stats.files, 2)
assert.strictEqual(stats.orphanBytes, 0, 'a corrupt store must not orphan every live log')

// ==================================================== pruneLogs: the age cutoff
await reset()
await writeStore([{ id: 's1', assistantId: 'a', name: 'one' }])
await writeLog('s1', 'new', 10, 1)
await writeLog('s1', 'mid', 20, 6)
await writeLog('s1', 'old', 30, 30)
let res = await pruneLogs(7)
assert.strictEqual(res.files, 1, 'only the file older than the cutoff goes')
assert.strictEqual(res.freed, 30, 'freed must report the real deleted size')
assert.deepStrictEqual((await fs.readdir(path.join(logs, 's1'))).sort(), ['mid.jsonl', 'new.jsonl'])

// days: 0 deletes every log regardless of age
res = await pruneLogs(0)
assert.strictEqual(res.files, 2)
assert.strictEqual(res.freed, 30)
assert.strictEqual((await logStats()).files, 0)

// nothing to delete reports zeroes, not a throw
assert.deepStrictEqual(await pruneLogs(7), { freed: 0, files: 0 })

// ====================================================== pruneLogs: orphan rule
await reset()
await writeStore([{ id: 's1', assistantId: 'a', name: 'one' }])
await writeLog('s1', 'fresh', 10, 0)
await writeLog('gone', 'fresh', 15, 0) // brand new, but its session is gone
res = await pruneLogs(7)
assert.strictEqual(res.files, 1, "an orphan's logs go regardless of age")
assert.strictEqual(res.freed, 15)
assert.ok(await fs.readFile(path.join(logs, 's1', 'fresh.jsonl'), 'utf8'), 'the live log must survive')
// the emptied orphan dir is removed too
assert.deepStrictEqual(await fs.readdir(logs), ['s1'])

// with an unreadable store nothing counts as an orphan, so no live log dies
await reset()
await fs.writeFile(store, '{ corrupt')
await writeLog('s1', 'fresh', 10, 0)
await writeLog('whoknows', 'fresh', 15, 0)
res = await pruneLogs(7)
assert.deepStrictEqual(res, { freed: 0, files: 0 }, 'a corrupt store must destroy nothing')
assert.strictEqual((await logStats()).files, 2, 'both logs must still be on disk')

// ======================================================= pruneLogs: keep list
// the keep list is what liveTermIds feeds in: a terminal whose recording stream
// is still open keeps its file even when it is both old AND orphaned
await reset()
await writeStore([]) // readable and empty, so every dir below is an orphan
await writeLog('gone', 'recording', 10, 99)
await writeLog('gone', 'closed', 20, 99)
res = await pruneLogs(7, ['recording'])
assert.strictEqual(res.files, 1, 'only the closed terminal may be deleted')
assert.strictEqual(res.freed, 20)
assert.deepStrictEqual(await fs.readdir(path.join(logs, 'gone')), ['recording.jsonl'])
// the parent dir survives because rmdir only succeeds on an empty dir
assert.deepStrictEqual(await fs.readdir(logs), ['gone'])

// once the kept file is gone too, the dir is cleaned up
res = await pruneLogs(7)
assert.strictEqual(res.files, 1)
assert.deepStrictEqual(await fs.readdir(logs), [], 'the emptied dir must be removed')

await fs.rm(tmp, { recursive: true, force: true })
await fs.rm(out, { force: true })
console.log('ok — log accounting and pruning')
