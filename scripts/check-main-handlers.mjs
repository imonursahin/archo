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

// ------------------------------------------------ the tab name → /rename sync
// A tab named after a ticket must reach the conversation, and a name Archo
// invented must not: renaming every conversation to "Terminal 3" would bury the
// ones the developer actually titled.
const genericRe = new Function(
  `${slice('const GENERIC_TAB_NAME_RE =', '\n\n', 'the generic tab name pattern')}\nreturn GENERIC_TAB_NAME_RE`
)()
for (const generic of ['claude', 'Claude', 'Terminal', 'Terminal 3', 'terminal 12'])
  assert.ok(genericRe.test(generic), `"${generic}" is an invented name, not a title`)
for (const real of ['PA-41439', 'MB-9543 fix', 'claude review', 'terminal cleanup'])
  assert.ok(!genericRe.test(real), `"${real}" is a name the developer typed`)

// The rename is typed into Claude's input box, so all three conditions must
// hold — foreground process, not mid-answer, and output settled.
const readyBlock = slice('function titleReady(', '\n}', 'the rename readiness check')
assert.match(readyBlock, /foreground\(terminalId\)/, 'Claude must own the terminal')
assert.match(readyBlock, /CLAUDE_BUSY_RE/, 'a mid-answer terminal must not be typed into')
assert.match(readyBlock, /idleMs\(terminalId\)\s*>/, 'the screen must have settled first')
// an unattended delivery fires with nobody watching, so it additionally refuses
// any terminal that has ever been typed into
assert.match(
  readyBlock,
  /!unattended\s*\|\|\s*outputSinceInputMs\(terminalId\)\s*>/,
  'the unattended path must require output that outlived the last keystroke'
)

// A name that could not be delivered is held, not dropped — that is the whole
// point: the tab is usually named before Claude is running in it.
const syncBlock = slice('function syncClaudeTitle(', '\n}', 'the title sync')
assert.match(syncBlock, /pendingTitle\.set/, 'an undeliverable name must be held')
const createBlock = slice("ipcMain.on('pty:create'", "ipcMain.on('pty:write'", 'the pty:create handler')
assert.match(createBlock, /pendingTitle\.set/, 'a launch in a named tab must arm the rename')
assert.match(createBlock, /GENERIC_TAB_NAME_RE/, 'invented names must be filtered at launch too')

// ------------------------------------------------------- the pending-title queue
// forgetPendingTitle and syncClaudeTitle are plain map bookkeeping, so they can
// be run for real once the type annotations are stripped off the slice.
const stripTypes = (s) => s.replace(/:\s*(?:string|void|boolean|number)\b/g, '')
const queueBlock = stripTypes(
  slice('function forgetPendingTitle(', '// Poll for the first quiet moment', 'the pending-title queue')
)
const makeQueue = (deliverable) => {
  const pendingTitle = new Map()
  const titleTimers = new Map()
  const drained = []
  const { syncClaudeTitle, forgetPendingTitle } = new Function(
    'deps',
    `const { GENERIC_TAB_NAME_RE, pendingTitle, titleTimers, sendRename, drainPendingTitle } = deps
     ${queueBlock}
     return { syncClaudeTitle, forgetPendingTitle }`
  )({
    GENERIC_TAB_NAME_RE: genericRe,
    pendingTitle,
    titleTimers,
    sendRename: () => deliverable,
    drainPendingTitle: (id) => drained.push(id)
  })
  return { pendingTitle, titleTimers, drained, syncClaudeTitle, forgetPendingTitle }
}

// A name Archo invented must not merely be ignored — it must cancel a real name
// that is still queued, or "Terminal 3" gets overwritten by a rename the user
// already moved on from, landing in a conversation that is no longer that tab.
let q = makeQueue(false)
q.pendingTitle.set('t1', 'PA-41439')
q.syncClaudeTitle('t1', 'Terminal 3')
assert.strictEqual(q.pendingTitle.has('t1'), false, 'a generic rename must clear the queued name')
assert.strictEqual(q.drained.length, 0, 'a generic rename must not arm a delivery chain')

// an undeliverable real name is held and a chain is armed for it
q = makeQueue(false)
q.syncClaudeTitle('t2', 'PA-41439')
assert.strictEqual(q.pendingTitle.get('t2'), 'PA-41439', 'an undeliverable name must be held')
assert.deepStrictEqual(q.drained, ['t2'], 'holding a name must arm the retry chain')

// a name delivered straight away leaves nothing queued behind it
q = makeQueue(true)
q.syncClaudeTitle('t3', 'PA-41439')
assert.strictEqual(q.pendingTitle.has('t3'), false, 'a delivered name must not stay queued')
assert.strictEqual(q.drained.length, 0, 'a delivered name needs no retry chain')

// ---------------------------------------------------------- drainPendingTitle
// The retry chain types into a live terminal on a timer with nobody watching.
// Two properties keep that safe, and neither is observable from the queue test:
// it gives up after a minute, and there is only ever one chain per terminal.
const drainBlock = slice('function drainPendingTitle(', '\n}', 'the pending-title drain')
assert.match(drainBlock, /deadlineMs = 60_000/, 'the one-minute deadline is the give-up point')
assert.match(
  drainBlock,
  /^[\s\S]*?clearTimeout\(titleTimers\.get\(terminalId\)\)[\s\S]*?setTimeout/,
  'the previous chain must be cleared before a new one is armed — one chain per terminal'
)
assert.match(
  drainBlock,
  /Date\.now\(\)\s*>\s*stopAt/,
  'past the deadline the name must be dropped, not retried forever'
)
assert.match(
  drainBlock,
  /stopAt[\s\S]*?pendingTitle\.delete\(terminalId\)/,
  'a dropped name must leave the queue, or it is retried by the next chain'
)

// ------------------------------------------------------ terminal:claudeId shape
// Three return values, and the renderer branches on all three: a session id
// opens the close modal with a transcript to erase, '' opens it with nothing to
// erase (claude ran but never registered an id), null skips the modal entirely.
// Collapsing '' to null silently stops offering to clean up after a crashed run.
const AsyncFunction = (async () => {}).constructor
const claudeIdBlock = slice(
  '    const s = await getSession(sessionId)\n    const t = s?.terminals',
  "\n  })\n  handle('claude:deleteTranscript'",
  'the terminal:claudeId handler body'
)
const claudeId = new AsyncFunction('sessionId', 'terminalId', 'getSession', claudeIdBlock)
const sessionOf = (terminals) => async () => ({ terminals })

assert.strictEqual(
  await claudeId('s', 't', sessionOf([{ id: 't', claudeSessionId: 'abc', ranClaude: true }])),
  'abc',
  'a known transcript id is returned as-is'
)
assert.strictEqual(
  await claudeId('s', 't', sessionOf([{ id: 't', ranClaude: true }])),
  '',
  "claude ran but left no id — '' still opens the modal"
)
assert.strictEqual(
  await claudeId('s', 't', sessionOf([{ id: 't', ranClaude: false }])),
  null,
  'a terminal that never ran claude must return null so no modal appears'
)
assert.strictEqual(
  await claudeId('s', 'missing', sessionOf([{ id: 't', ranClaude: true }])),
  null,
  'an unknown terminal must return null, not the empty-string case'
)
assert.strictEqual(
  await claudeId('s', 't', async () => undefined),
  null,
  'a missing session must return null'
)

// ------------------------------------------------- claude:deleteTranscript passes
// Claude flushes its transcript back to disk on the way out, so a single delete
// can be undone by the process it just killed. Two passes with a settle in
// between, and the SECOND pass decides whether anything is still there.
const deleteBlock = slice(
  '    const s = await getSession(sessionId)\n    const id',
  "\n  })\n  handle('memories:clear'",
  'the claude:deleteTranscript handler body'
)
const deleteHandler = new AsyncFunction(
  'sessionId',
  'terminalId',
  'getSession',
  'deleteTranscript',
  deleteBlock
)

// no transcript id: the handler must not call the deleter at all
let passes = []
let res = await deleteHandler('s', 't', sessionOf([{ id: 't', ranClaude: true }]), () => {
  passes.push(Date.now())
  return { removed: 1, failed: 0 }
})
assert.deepStrictEqual(
  res,
  { hadId: false, removed: 0, failed: 0 },
  'without an id the handler reports hadId:false and deletes nothing'
)
assert.strictEqual(passes.length, 0, 'without an id nothing must be deleted')

// with an id: two passes, separated by the settle, and the counts combine
passes = []
const results = [
  { removed: 1, failed: 3 },
  { removed: 2, failed: 0 }
]
res = await deleteHandler('s', 't', sessionOf([{ id: 't', claudeSessionId: 'abc' }]), () => {
  passes.push(Date.now())
  return results[passes.length - 1]
})
assert.strictEqual(passes.length, 2, 'a single pass loses whatever claude flushed on shutdown')
assert.ok(passes[1] - passes[0] >= 550, `the second pass must wait out the flush (${passes[1] - passes[0]}ms)`)
assert.strictEqual(res.hadId, true)
assert.strictEqual(res.removed, 3, 'removed counts both passes')
assert.strictEqual(
  res.failed,
  0,
  'failed comes from the second pass only — a file the first pass failed on and the second removed is not a failure'
)

// and a file that survives both passes is still reported as failed
passes = []
res = await deleteHandler('s', 't', sessionOf([{ id: 't', claudeSessionId: 'abc' }]), () => {
  passes.push(Date.now())
  return { removed: 0, failed: 2 }
})
assert.strictEqual(res.failed, 2, 'a transcript still on disk after both passes must be reported')

console.log(
  'ok — main handler logic: clone target, plugins dispatch, prune join, export count, title sync'
)
