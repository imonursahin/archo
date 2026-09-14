// Self-check for the stored-preference cleanup: deleting a resource or an
// assistant must drop exactly its own references and write nothing otherwise.
// Run: node scripts/check-prefs.mjs
import { buildSync } from 'esbuild'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archo-prefs-'))
const out = path.join(tmp, 'prefs.mjs')

// a counting localStorage: the no-op cases below assert that nothing is written
const store = new Map()
let writes = []
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => {
    writes.push(['set', k])
    store.set(k, String(v))
  },
  removeItem: (k) => {
    writes.push(['remove', k])
    store.delete(k)
  },
  clear: () => store.clear()
}

// the JS API, not the .bin shim — that shim is esbuild.cmd on Windows
buildSync({
  entryPoints: [path.join(root, 'src/renderer/src/lib/prefs.ts')],
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  outfile: out
})
const { forgetResource, forgetAssistant, getFavorites, getOrder, setOrder, toggleFavorite } =
  await import(pathToFileURL(out).href)

const setup = (state) => {
  store.clear()
  for (const [k, v] of Object.entries(state)) store.set(k, JSON.stringify(v))
  writes = []
}
const favs = () => [...getFavorites()].sort()

// ===================================================================== isUnder
// reached through forgetResource: a deleted skill takes its whole folder, but a
// sibling whose name merely starts with the same letters must survive
setup({
  favorites: [],
  'order:a:skills': [
    '/a/skill',
    '/a/skill/SKILL.md', // under, by the POSIX separator
    '/a/skill/nested/x.md',
    '/a/skillish/other.md', // NOT under — prefix collision
    '/a/other.md'
  ]
})
forgetResource('a', '/a/skill')
assert.deepStrictEqual(
  getOrder('a', 'skills'),
  ['/a/skillish/other.md', '/a/other.md'],
  'the prefix-collision guard failed: only dir + separator counts as "under"'
)

// the Windows separator matches too
setup({ favorites: [], 'order:a:skills': ['C:\\a\\b\\x.md', 'C:\\ab\\x.md'] })
forgetResource('a', 'C:\\a')
assert.deepStrictEqual(getOrder('a', 'skills'), ['C:\\ab\\x.md'], 'the backslash separator failed')

// =============================================================== forgetResource
setup({
  favorites: ['/a/gone.md', '/a/stays.md'],
  'order:a:skills': ['/a/gone.md', '/a/stays.md'],
  'order:a:agents': ['/a/stays.md']
})
forgetResource('a', '/a/gone.md')
assert.deepStrictEqual(favs(), ['/a/stays.md'], 'the path must be removed from favorites')
assert.deepStrictEqual(getOrder('a', 'skills'), ['/a/stays.md'])
assert.deepStrictEqual(getOrder('a', 'agents'), ['/a/stays.md'], 'an untouched group must survive')
// the untouched group was not rewritten
assert.ok(
  !writes.some(([, k]) => k === 'order:a:agents'),
  'a group with nothing to drop must not be written back'
)

// ======================================================= forgetResource: no-op
// a path in neither favorites nor any order list writes nothing at all
setup({ favorites: ['/a/stays.md'], 'order:a:skills': ['/a/stays.md'] })
forgetResource('a', '/a/never-existed.md')
assert.deepStrictEqual(writes, [], `a no-op must not touch localStorage (${JSON.stringify(writes)})`)
assert.deepStrictEqual(favs(), ['/a/stays.md'])
assert.deepStrictEqual(getOrder('a', 'skills'), ['/a/stays.md'])

// present in favorites only: exactly one write, to the favorites key
setup({ favorites: ['/a/gone.md'], 'order:a:skills': ['/a/stays.md'] })
forgetResource('a', '/a/gone.md')
assert.deepStrictEqual(writes, [['set', 'favorites']], 'only the favorites key may be written')

// ============================================================== forgetAssistant
setup({
  favorites: ['/base/one.md', '/base/deep/two.md', '/elsewhere/three.md'],
  'recentdirs:a': ['/base', '/tmp'],
  'order:a:skills': ['/base/one.md'],
  'order:a:agents': ['/base/x.md'],
  'order:a:commands': [],
  'order:a:mcp': [],
  'order:a:plugins': [],
  'order:a:instructions': [],
  'order:a:hooks': [],
  'order:a:settings': [],
  'order:b:skills': ['/other/x.md'] // a different assistant
})
forgetAssistant('a', '/base')
for (const g of ['skills', 'agents', 'commands', 'mcp', 'plugins', 'instructions', 'hooks', 'settings'])
  assert.strictEqual(store.has(`order:a:${g}`), false, `order:a:${g} survived`)
assert.strictEqual(store.has('recentdirs:a'), false, 'the recent dirs must go')
assert.deepStrictEqual(favs(), ['/elsewhere/three.md'], 'only favorites under baseDir may be dropped')
assert.ok(store.has('order:b:skills'), "another assistant's ordering must survive")

// an assistant with nothing stored writes nothing to the favorites key
setup({ favorites: ['/elsewhere/three.md'] })
forgetAssistant('zzz', '/nothing/here')
assert.ok(
  !writes.some(([op]) => op === 'set'),
  `nothing was stored, so nothing may be written (${JSON.stringify(writes)})`
)
assert.deepStrictEqual(favs(), ['/elsewhere/three.md'])

// baseDir itself is not a favorite "under" itself — only its contents are
setup({ favorites: ['/base'] })
forgetAssistant('a', '/base')
assert.deepStrictEqual(favs(), ['/base'], 'isUnder must require the separator')

// a sanity check that the favorites round-trip the test harness at all
setup({ favorites: [] })
toggleFavorite('/x/y.md')
assert.deepStrictEqual(favs(), ['/x/y.md'])

await fs.rm(tmp, { recursive: true, force: true })
console.log('ok — stored preference cleanup')
