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
const {
  forgetResource,
  forgetAssistant,
  getFavorites,
  getOrder,
  setOrder,
  toggleFavorite,
  getFolders,
  addFolder,
  removeFolder,
  assignFolder,
  applyOrder,
  exportAppState,
  importAppState
} = await import(pathToFileURL(out).href)

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

// ===================================================================== folders
// A folder is Archo's own grouping: nothing on disk moves, so the record is the
// only thing that says what belongs together.
setup({})
addFolder('a', 'skills', 'work')
addFolder('a', 'skills', 'work') // the same name twice is one folder
addFolder('a', 'skills', '  ') // a blank name is not a folder
assert.deepStrictEqual(getFolders('a', 'skills').names, ['work'])

assignFolder('a', 'skills', '/a/skill/SKILL.md', 'work')
assert.strictEqual(getFolders('a', 'skills').of['/a/skill/SKILL.md'], 'work')
assignFolder('a', 'skills', '/a/skill/SKILL.md', null)
assert.strictEqual(
  getFolders('a', 'skills').of['/a/skill/SKILL.md'],
  undefined,
  'null takes a resource out of every folder'
)

// removing a folder frees its members instead of losing them
assignFolder('a', 'skills', '/a/one/SKILL.md', 'work')
assignFolder('a', 'skills', '/a/two/SKILL.md', 'later')
addFolder('a', 'skills', 'later')
removeFolder('a', 'skills', 'work')
assert.deepStrictEqual(getFolders('a', 'skills').names, ['later'])
assert.strictEqual(getFolders('a', 'skills').of['/a/one/SKILL.md'], undefined)
assert.strictEqual(getFolders('a', 'skills').of['/a/two/SKILL.md'], 'later', 'the other folder is untouched')

// a deleted resource leaves no membership behind — recreating it at the same
// path would otherwise drop it back into a folder it was never put in
forgetResource('a', '/a/two/SKILL.md')
assert.strictEqual(getFolders('a', 'skills').of['/a/two/SKILL.md'], undefined)

// and a deleted skill takes the files that lived inside it
setup({})
addFolder('a', 'skills', 'work')
assignFolder('a', 'skills', '/a/skill/SKILL.md', 'work')
assignFolder('a', 'skills', '/a/skill/references/x.md', 'work')
forgetResource('a', '/a/skill')
assert.deepStrictEqual(getFolders('a', 'skills').of, {}, 'the whole folder goes')

// a file is ordered with the resource it belongs to, never sunk to the bottom
setup({ 'order:a:skills': ['/b/SKILL.md', '/a/SKILL.md'] })
const ordered = applyOrder(
  [
    { path: '/a/SKILL.md' },
    { path: '/a/refs/one.md', meta: { under: '/a/SKILL.md' } },
    { path: '/b/SKILL.md' }
  ],
  'a',
  'skills'
).map((i) => i.path)
assert.deepStrictEqual(ordered, ['/b/SKILL.md', '/a/SKILL.md', '/a/refs/one.md'])

// a stored record missing a field reads as empty instead of crashing the sidebar
setup({ 'folders:a:skills': { names: ['work'] } })
assert.deepStrictEqual(getFolders('a', 'skills'), { names: ['work'], of: {} })
setup({ 'folders:a:skills': 'not json at all' })
assert.deepStrictEqual(getFolders('a', 'skills'), { names: [], of: {} })

// a member outside the assistant folder cannot be made relative, so it stays
// home; a group with no folders is not written into the bundle at all
setup({})
addFolder('a', 'skills', 'work')
assignFolder('a', 'skills', '/old/base/.claude/skills/in/SKILL.md', 'work')
assignFolder('a', 'skills', '/somewhere/else/SKILL.md', 'work')
const edges = exportAppState('/old/base', 'a')
assert.deepStrictEqual(edges.folders.skills.of, { '.claude/skills/in/SKILL.md': 'work' })
assert.ok(!('agents' in edges.folders), 'a group without folders is omitted')

// an older or hand-edited bundle with a bare folders entry imports as empty
setup({})
importAppState('/new/base', 'b', { prompts: [], favorites: [], order: {}, folders: { skills: {} } })
assert.deepStrictEqual(getFolders('b', 'skills'), { names: [], of: {} })

// the grouping travels with the assistant: paths go out relative to the folder
// and come back absolute, so the same layout appears on another machine
setup({})
addFolder('a', 'skills', 'work')
assignFolder('a', 'skills', '/old/base/.claude/skills/one/SKILL.md', 'work')
const bundle = exportAppState('/old/base', 'a')
assert.deepStrictEqual(bundle.folders.skills.names, ['work'])
assert.deepStrictEqual(
  bundle.folders.skills.of,
  { '.claude/skills/one/SKILL.md': 'work' },
  'a path leaves the machine relative to the assistant folder'
)
setup({})
importAppState('/new/base', 'b', bundle)
assert.deepStrictEqual(getFolders('b', 'skills').names, ['work'])
assert.strictEqual(
  getFolders('b', 'skills').of['/new/base/.claude/skills/one/SKILL.md'],
  'work',
  'and lands under the new folder on the way in'
)

// forgetAssistant drops the folder records too, and only its own
setup({
  'folders:a:skills': { names: ['work'], of: { '/base/s/SKILL.md': 'work' } },
  'folders:a:agents': { names: ['x'], of: {} },
  'folders:b:skills': { names: ['keep'], of: {} }
})
forgetAssistant('a', '/base')
for (const g of ['skills', 'agents', 'commands', 'mcp', 'plugins', 'instructions', 'hooks', 'settings'])
  assert.strictEqual(store.has(`folders:a:${g}`), false, `folders:a:${g} survived`)
assert.ok(store.has('folders:b:skills'), "another assistant's folders must survive")

// a corrupt record reads as no folders, never throws
setup({})
store.set('folders:a:skills', '{ not json')
assert.deepStrictEqual(getFolders('a', 'skills'), { names: [], of: {} }, 'corrupt JSON must fall back to empty')

// a names field that is not an array is ignored
setup({ 'folders:a:skills': { names: 'work', of: { '/a/x.md': 'work' } } })
assert.deepStrictEqual(getFolders('a', 'skills').names, [], 'a non-array names must fall back to []')

await fs.rm(tmp, { recursive: true, force: true })
console.log('ok — stored preference cleanup, sidebar folders and their export')
