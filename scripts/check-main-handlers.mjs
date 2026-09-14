// Self-check for logic that lives inside an ipcMain handler: the clone target
// name derived from an untrusted URL, the plugins:action dispatch table, and the
// two joins (pruneLogs + liveTermIds, export file count) that no single-module
// check can see. These blocks sit in closures inside src/main/index.ts, which
// imports electron and cannot be imported from a plain node process — so the
// block is sliced out of the real source text and run. Slicing means a rewrite
// of the surrounding handler shows up here as a failure to locate the block,
// which is the intended alarm: this file must be re-pointed, not deleted.
// Run: node scripts/check-main-handlers.mjs
import { promises as fs } from 'fs'
import path from 'path'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const src = await fs.readFile(path.join(root, 'src/main/index.ts'), 'utf8')

function slice(from, to, label) {
  const a = src.indexOf(from)
  assert.notStrictEqual(a, -1, `could not locate the start of ${label} — re-point this check`)
  const b = src.indexOf(to, a)
  assert.notStrictEqual(b, -1, `could not locate the end of ${label} — re-point this check`)
  return src.slice(a, b)
}

// ------------------------------------------------- share:clone target folder
// The only path-traversal surface in sharing: the folder name is whatever the
// URL's last segment happens to be. Run the real derivation, with the filesystem
// probe stubbed so the collision loop is observable.
const cloneBlock = slice(
  "    const name =\n",
  '    try {',
  'the share:clone target derivation'
)
const ROOT = path.join(path.sep, 'assistants')
const deriveTarget = new Function(
  'url',
  'path',
  'fs',
  'ASSISTANTS_ROOT',
  `${cloneBlock}\n return { name, target }`
)
const noneExist = { existsSync: () => false }
const target = (url, fsStub = noneExist) => deriveTarget(url, path, fsStub, ROOT)

// a traversal in the URL cannot become a traversal in the path: only the last
// segment is ever read, and a separator cannot survive the character filter
for (const url of [
  '../../etc',
  'https://h/a/../../b',
  'https://h/../../../../etc/passwd',
  '/tmp/x/../../../etc',
  'git@h:../../etc'
]) {
  const r = target(url)
  assert.ok(!r.name.includes('..'), `'${url}' kept a '..' segment: ${r.name}`)
  assert.ok(!/[/\\]/.test(r.name), `'${url}' kept a separator: ${r.name}`)
  assert.strictEqual(
    path.dirname(r.target),
    ROOT,
    `'${url}' escaped the assistants root: ${r.target}`
  )
}
assert.strictEqual(target('../../etc').name, 'etc', 'the last segment is the name')
assert.strictEqual(target('https://h/a/../../b').name, 'b')

// a name made only of rejected characters filters down to nothing, and an empty
// name would make the target the root directory itself
assert.strictEqual(target('https://h/!!!').name, 'assistant', 'an all-symbol name needs a fallback')
assert.strictEqual(target('https://h/..').name, 'assistant', 'a dots-only name needs a fallback')
assert.strictEqual(target('https://h/').name, 'assistant', 'an empty tail needs a fallback')
assert.strictEqual(target('').name, 'assistant')

// the ordinary cases still behave
assert.strictEqual(target('https://github.com/o/repo.git').name, 'repo', '.git is stripped')
assert.strictEqual(target('git@github.com:o/repo.git').name, 'repo')
assert.strictEqual(target('https://h/my repo').name, 'my-repo', 'a space is not a name character')

// an over-long segment is capped, so the name can never exceed a path component
const long = target('https://h/' + 'a'.repeat(300))
assert.strictEqual(long.name.length, 64, 'the 64-character cap did not apply')

// ------------------------------------------------------------ collision loop
// cloning the same URL twice must not clone into the existing assistant
const taken = new Set([path.join(ROOT, 'repo')])
const once = target('https://h/repo.git', { existsSync: (p) => taken.has(p) })
assert.strictEqual(path.basename(once.target), 'repo-2', 'the first collision takes -2')
taken.add(path.join(ROOT, 'repo-2'))
const twice = target('https://h/repo.git', { existsSync: (p) => taken.has(p) })
assert.strictEqual(path.basename(twice.target), 'repo-3', 'the suffix increments, it does not repeat')

// the suffix is still inside the root
assert.strictEqual(path.dirname(twice.target), ROOT)

// ---------------------------------------------------- share:clone rollback
// a failed clone leaves a partial directory behind; it must be removed, or the
// next attempt collides with the wreckage of the last one and becomes name-2
const cloneHandler = slice("  handle('share:clone'", "\n  handle('logs:stats'", 'the share:clone handler')
const rollback = cloneHandler.slice(cloneHandler.indexOf('} catch'))
assert.match(
  rollback,
  /fs\.promises\.rm\(\s*target\s*,\s*\{[^}]*recursive:\s*true[^}]*force:\s*true/,
  'a failed clone must remove the target directory it created'
)
assert.match(rollback, /ok:\s*false/, 'a failed clone must report failure to the renderer')

// -------------------------------------------------------- plugins:action map
// eight actions, each to its own wrapper. A case falling to the wrong wrapper
// still returns {ok:true} and looks like it worked.
// `as const` is the only TypeScript left in this block once it is sliced out
const switchBlock = slice('    switch (action) {', '\n  })', 'the plugins:action switch').replace(
  /\s+as const/g,
  ''
)
const calls = []
const spy = (name) => (dir, arg) => (calls.push([name, dir, arg]), { ok: true })
const dispatch = new Function(
  'action',
  'arg',
  'dir',
  'w',
  `const {pluginInstall,pluginUninstall,pluginUpdate,pluginEnable,pluginDisable,
    marketplaceAdd,marketplaceRemove,marketplaceUpdate} = w
   ${switchBlock}`
)
const wrappers = {}
for (const n of [
  'pluginInstall',
  'pluginUninstall',
  'pluginUpdate',
  'pluginEnable',
  'pluginDisable',
  'marketplaceAdd',
  'marketplaceRemove',
  'marketplaceUpdate'
])
  wrappers[n] = spy(n)

const expected = [
  ['install', 'pluginInstall'],
  ['uninstall', 'pluginUninstall'],
  ['update', 'pluginUpdate'],
  ['enable', 'pluginEnable'],
  ['disable', 'pluginDisable'],
  ['marketplaceAdd', 'marketplaceAdd'],
  ['marketplaceRemove', 'marketplaceRemove'],
  ['marketplaceUpdate', 'marketplaceUpdate']
]
for (const [action, fn] of expected) {
  calls.length = 0
  dispatch(action, 'arg-value', '/dir', wrappers)
  assert.strictEqual(calls.length, 1, `${action} called ${calls.length} wrappers`)
  assert.strictEqual(calls[0][0], fn, `${action} dispatched to ${calls[0][0]}`)
  assert.strictEqual(calls[0][1], '/dir', `${action} lost the assistant directory`)
  assert.strictEqual(calls[0][2], 'arg-value', `${action} lost its argument`)
}
assert.strictEqual(expected.length, 8, 'the dispatch table lost a case')

// an empty marketplace name means "update every marketplace", which is a
// different call from updating the one named '' — the wrapper branches on
// undefined, so '' must not reach it
calls.length = 0
dispatch('marketplaceUpdate', '', '/dir', wrappers)
assert.strictEqual(calls[0][2], undefined, "an empty name must arrive as undefined, not ''")

// an unknown action reports rather than silently doing nothing
calls.length = 0
const unknown = dispatch('nope', 'x', '/dir', wrappers)
assert.strictEqual(calls.length, 0, 'an unknown action must reach no wrapper')
assert.strictEqual(unknown.ok, false)
assert.match(unknown.error, /unknown action nope/)

// ---------------------------------------------------------------- logs:prune
// check-pty.mjs and check-logs.mjs each cover one half of this and both note
// that index.ts joins them. Dropping the second argument makes pruneLogs treat
// a recording terminal's log as orphaned and delete it mid-session.
assert.match(
  src,
  /handle\(\s*'logs:prune'[\s\S]{0,80}?pruneLogs\(\s*days\s*,\s*liveTermIds\(\)\s*\)/,
  'logs:prune must pass liveTermIds() — without it a live terminal loses its log'
)

// ------------------------------------------------------------ assistant:export
// the renderer picks toastExported vs toastExportDropped off these two numbers
const exportBlock = slice(
  "  handle('assistant:export'",
  "  handle('assistant:import'",
  'the assistant:export handler'
)
assert.match(
  exportBlock,
  /files:\s*Object\.keys\(bundle\.files\)\.length/,
  'the export result must report how many files were written'
)
assert.match(exportBlock, /\bdropped\b/, 'the dropped count must pass through to the renderer')
// a cancelled dialog is not a successful export with zero files
assert.match(
  exportBlock,
  /res\.canceled[\s\S]*?ok:\s*false/,
  'a cancelled save dialog must report failure'
)

console.log('ok — main handler logic: clone target, plugins dispatch, prune join, export count')
