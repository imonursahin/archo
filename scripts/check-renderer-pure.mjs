// Self-check for the pure functions inside renderer components: frontmatter
// linting, prompt-variable substitution and byte formatting. They decide what
// the user is told, but they are module-private helpers of a .tsx component and
// there is no renderer test harness to mount one — so each function's real
// source text is lifted out and compiled on its own. Nothing here is a copy of
// the logic: if the function changes, this check runs the changed version.
// Run: node scripts/check-renderer-pure.mjs
import { transformSync } from 'esbuild'
import { promises as fs } from 'fs'
import path from 'path'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const read = (rel) => fs.readFile(path.join(root, rel), 'utf8')

// Every one of these is a top-level `function name(...) {` in its module, so the
// body ends at the first closing brace in column 0.
function grab(text, name) {
  const start = text.indexOf(`function ${name}(`)
  assert.notStrictEqual(start, -1, `${name} is no longer a top-level function — re-point this check`)
  const end = text.indexOf('\n}\n', start)
  assert.notStrictEqual(end, -1, `could not find the end of ${name}`)
  return text.slice(start, end + 3)
}

// compile the lifted TypeScript and hand back the real functions
function load(snippet, names) {
  const js = transformSync(snippet, { loader: 'ts' }).code
  return new Function(`${js}\nreturn { ${names.join(', ')} }`)()
}

// ------------------------------------------------------------------- lint
// Claude Code discovers a skill or agent only through its frontmatter, so these
// messages are the only warning before a resource silently never triggers.
const editorSrc = await read('src/renderer/src/components/Editor.tsx')
// i18n lookups become the key itself, so assertions can name the message
const i18nStub = `const t = (k: string) => k
const ti = (k: string, _p?: unknown) => k
`
const { lint } = load(i18nStub + grab(editorSrc, 'lint'), ['lint'])
const levels = (r) => r.map((x) => `${x.level}:${x.text}`)
const OK_DESC = 'a description comfortably past the minimum length'

// a kind with no frontmatter contract is not linted at all
for (const kind of ['mcp', 'hook', 'settings', ''])
  assert.deepStrictEqual(lint(kind, 'x/y.md', {}, true), [], `${kind} must not be linted`)

// no frontmatter at all: fatal for skill and agent, silent for a command
for (const kind of ['skill', 'agent']) {
  const r = lint(kind, `x/${kind}/SKILL.md`, {}, false)
  assert.deepStrictEqual(levels(r), ['error:lintNoFrontmatter'], `${kind} without frontmatter`)
  assert.strictEqual(r.length, 1, 'the no-frontmatter error must short-circuit the rest')
}
assert.deepStrictEqual(
  lint('command', 'x/commands/foo.md', {}, false),
  [],
  'a command without frontmatter is valid'
)

// name and description are required — except for a command, where both are
assert.deepStrictEqual(
  levels(lint('skill', 'x/foo/SKILL.md', {}, true)),
  ['error:lintNoName', 'error:lintNoDesc'],
  'a skill needs both name and description'
)
assert.deepStrictEqual(
  lint('command', 'x/commands/foo.md', {}, true),
  [],
  'a command needs neither name nor description'
)
// whitespace is not a value
assert.deepStrictEqual(
  levels(lint('agent', 'x/agents/foo.md', { name: '   ', description: '  ' }, true)),
  ['error:lintNoName', 'error:lintNoDesc'],
  'a blank name is a missing name'
)

// the name shape Claude Code accepts: lowercase, digits and dashes, never
// leading with a dash
for (const bad of ['Foo', 'foo_bar', '-foo', 'foo bar', 'füü'])
  assert.deepStrictEqual(
    levels(lint('agent', 'x/agents/foo.md', { name: bad, description: OK_DESC }, true)),
    ['warn:lintNameShape'],
    `'${bad}' is not a valid name shape`
  )
for (const good of ['foo', 'foo-bar', 'a', '0foo', 'foo-2'])
  assert.deepStrictEqual(
    levels(lint('agent', `x/agents/${good}.md`, { name: good, description: OK_DESC }, true)),
    [],
    `'${good}' is a valid name shape`
  )

// a short description is a warning, not an error — it still loads, it just
// gives the model too little to route on
assert.deepStrictEqual(
  levels(lint('agent', 'x/agents/foo.md', { name: 'foo', description: 'too short' }, true)),
  ['warn:lintDescShort']
)
assert.deepStrictEqual(
  levels(lint('agent', 'x/agents/foo.md', { name: 'foo', description: 'x'.repeat(24) }, true)),
  ['warn:lintDescShort'],
  '24 characters is still short'
)
assert.deepStrictEqual(
  levels(lint('agent', 'x/agents/foo.md', { name: 'foo', description: 'x'.repeat(25) }, true)),
  [],
  '25 characters is the threshold, not one past it'
)

// ------------------------------------------------- lint: expected-name source
// a skill is identified by its folder (<dir>/SKILL.md), an agent or command by
// its filename — getting this backwards makes every skill look misnamed
const skillFm = { name: 'my-skill', description: OK_DESC }
assert.deepStrictEqual(
  levels(lint('skill', '/a/skills/my-skill/SKILL.md', skillFm, true)),
  [],
  'a skill in its matching folder is clean'
)
assert.deepStrictEqual(
  levels(lint('skill', '/a/skills/other-folder/SKILL.md', skillFm, true)),
  ['warn:lintNameMismatch'],
  'a skill in the wrong folder must warn'
)
// the filename is not the skill's identity: SKILL.md is the same for all of them
assert.deepStrictEqual(
  levels(lint('skill', '/a/skills/my-skill/SKILL.md', skillFm, true)),
  [],
  'a skill must not be compared against its SKILL.md filename'
)

const agentFm = { name: 'foo', description: OK_DESC }
assert.deepStrictEqual(
  levels(lint('agent', 'agents/foo.md', agentFm, true)),
  [],
  'agents/foo.md named foo must not warn'
)
assert.deepStrictEqual(
  levels(lint('agent', 'agents\\foo.md', agentFm, true)),
  [],
  'a Windows separator must split the same way'
)
assert.deepStrictEqual(
  levels(lint('agent', 'agents/bar.md', agentFm, true)),
  ['warn:lintNameMismatch'],
  'an agent whose filename differs from its name must warn'
)
// an agent's parent folder is not its identity either
assert.deepStrictEqual(levels(lint('agent', 'foo/bar.md', agentFm, true)), ['warn:lintNameMismatch'])

// ------------------------------------------------- promptVars / fillVars
// a saved prompt is a template; these two decide which blanks the user is asked
// for and what the terminal finally receives
const toolsSrc = await read('src/renderer/src/components/SessionTools.tsx')
const reLine = toolsSrc.match(/^const PROMPT_VAR_RE = .*$/m)
assert.ok(reLine, 'PROMPT_VAR_RE is no longer a single-line const — re-point this check')
const { promptVars, fillVars } = load(
  `${reLine[0]}\n${grab(toolsSrc, 'promptVars')}\n${grab(toolsSrc, 'fillVars')}`,
  ['promptVars', 'fillVars']
)

assert.deepStrictEqual(promptVars('no variables here'), [])
assert.deepStrictEqual(promptVars('{{a}} and {{b}}'), ['a', 'b'])
// first-seen order, de-duplicated: the prompt form is built from this list, so
// a repeat must not produce a second input for the same variable
assert.deepStrictEqual(promptVars('{{b}} {{a}} {{b}}'), ['b', 'a'], 'order is first appearance')
assert.deepStrictEqual(promptVars('{{a}}{{a}}{{a}}'), ['a'])
// whitespace inside the braces is tolerated, and is not part of the name
assert.deepStrictEqual(promptVars('{{ spaced }}'), ['spaced'])
assert.deepStrictEqual(promptVars('{{a}} {{ a }}'), ['a'], 'spacing is not a different variable')
// the accepted name characters
assert.deepStrictEqual(promptVars('{{a.b-c_d9}}'), ['a.b-c_d9'])
// and what is not a variable
assert.deepStrictEqual(promptVars('{{two words}}'), [], 'an inner space is not a name')
assert.deepStrictEqual(promptVars('{single}'), [])
assert.deepStrictEqual(promptVars('{{}}'), [], 'an empty name is not a variable')

assert.strictEqual(fillVars('hello {{name}}', { name: 'world' }), 'hello world')
assert.strictEqual(fillVars('{{a}}-{{b}}', { a: '1', b: '2' }), '1-2')
assert.strictEqual(fillVars('{{a}} {{a}}', { a: 'x' }), 'x x', 'every occurrence is replaced')
assert.strictEqual(fillVars('{{ name }}!', { name: 'v' }), 'v!', 'the spaced form substitutes too')
// an unknown placeholder survives verbatim rather than becoming "undefined"
assert.strictEqual(fillVars('{{unknown}}', {}), '{{unknown}}')
assert.strictEqual(fillVars('a {{x}} b', { other: 'v' }), 'a {{x}} b')
// ?? and not ||: clearing a variable deliberately must send an empty value, not
// leave the raw {{name}} in the command that reaches the terminal
assert.strictEqual(fillVars('a{{x}}b', { x: '' }), 'ab', "an empty value must substitute")
assert.strictEqual(fillVars('{{x}}', { x: '0' }), '0', "'0' must substitute")

// ---------------------------------------------------------------- fmtSize
// shared by the log cleanup and the memory cleanup, so it lives in lib/format
const { fmtSize } = load(grab(await read('src/renderer/src/lib/format.ts'), 'fmtSize'), ['fmtSize'])

// below a kilobyte the raw count is shown, with no decimal
assert.strictEqual(fmtSize(0), '0 B')
assert.strictEqual(fmtSize(1), '1 B')
assert.strictEqual(fmtSize(1023), '1023 B', '1023 is the last byte-formatted value')
// the ladder
assert.strictEqual(fmtSize(1024), '1.0 KB')
assert.strictEqual(fmtSize(1536), '1.5 KB')
assert.strictEqual(fmtSize(1024 ** 2), '1.0 MB')
assert.strictEqual(fmtSize(1024 ** 3), '1.0 GB')
assert.strictEqual(fmtSize(1024 ** 4), '1.0 TB')
// one decimal below ten, rounded above — a log folder reads as "12 MB", not
// "12.3457 MB"
assert.strictEqual(fmtSize(9.94 * 1024), '9.9 KB')
assert.strictEqual(fmtSize(10 * 1024), '10 KB', 'ten is the switch to whole units')
assert.strictEqual(fmtSize(12.5 * 1024 ** 2), '13 MB')
// and the ladder stops at TB rather than running off the end of the unit list
assert.strictEqual(fmtSize(1024 ** 5), '1024 TB', 'the unit must cap at TB')
assert.strictEqual(fmtSize(1024 ** 6), '1048576 TB')

// ------------------------------------------------- App.tsx: forgetResource
// prefs.forgetResource drops a remembered path. An mcp item is one server entry
// inside a shared file, so the file is still live after it is deleted — calling
// forgetResource for it would discard the state of every other server in it.
const appSrc = await read('src/renderer/src/App.tsx')
assert.match(
  appSrc,
  /if \([^)]*item\.kind !== 'mcp'\)\s*forgetResource\(/,
  'forgetResource must not be called for an mcp item — its file outlives the entry'
)

// ------------------------------------------- HookPanel: saveRaw and persist
// Raw mode hands the user a free-text JSON box that is written straight into
// settings. Both guards below are the only thing between a typo and a settings
// file Claude Code can no longer read. These are closures over component state
// rather than pure functions, so they are lifted with every binding injected —
// still the real source, with the surroundings stubbed.
const hookSrc = await read('src/renderer/src/components/HookPanel.tsx')
function grabNested(text, name) {
  const start = text.search(new RegExp(`(async )?function ${name}\\(`))
  assert.notStrictEqual(start, -1, `${name} not found in HookPanel — re-point this check`)
  const end = text.indexOf('\n  }\n', start)
  assert.notStrictEqual(end, -1, `could not find the end of ${name}`)
  return text.slice(start, end + 5)
}
const hookJs = transformSync(
  `${grabNested(hookSrc, 'persist')}\n${grabNested(hookSrc, 'saveRaw')}`,
  { loader: 'ts' }
).code
const mkHook = new Function(
  'draft',
  'window',
  'file',
  'event',
  'setMatchers',
  'onChanged',
  'toast',
  't',
  'ti',
  'setErr',
  'setBusy',
  'setRaw',
  `${hookJs}\nreturn { persist, saveRaw }`
)

function panel(draft, writeImpl) {
  const log = { err: '', writes: [], matchers: null, changed: 0, toasts: [], rawExited: false }
  const api = {
    updateHookEvent: async (f, e, next) => {
      log.writes.push([f, e, next])
      if (writeImpl) return writeImpl()
      return undefined
    }
  }
  const h = mkHook(
    draft,
    { api },
    'settings.json',
    'PreToolUse',
    (m) => (log.matchers = m),
    () => log.changed++,
    (msg, kind) => log.toasts.push([msg, kind]),
    (k) => k,
    (k) => k,
    (e) => (log.err = e),
    () => {},
    (v) => (log.rawExited = v === false)
  )
  return { ...h, log }
}

// invalid JSON never reaches the settings file
for (const bad of ['not json', '{', '[1,]x', '']) {
  const p = panel(bad)
  await p.saveRaw()
  assert.match(p.log.err, /^errInvalidJson/, `'${bad}' must report invalid JSON`)
  assert.deepStrictEqual(p.log.writes, [], `'${bad}' must not be written`)
}

// valid JSON that is not an array is the dangerous case: it parses, so only the
// shape guard stops it, and hooks are always a list of matchers
for (const notArray of ['{"a":1}', '"a string"', '123', 'null', 'true']) {
  const p = panel(notArray)
  await p.saveRaw()
  assert.strictEqual(p.log.err, 'hookMustBeArray', `${notArray} must be rejected as not-an-array`)
  assert.deepStrictEqual(p.log.writes, [], `${notArray} must not be written`)
  assert.strictEqual(p.log.changed, 0, 'a rejected save must not notify')
}

// a well-formed array goes through, clears the error and leaves raw mode
const good = panel('[{"matcher":"Bash","hooks":[]}]')
await good.saveRaw()
assert.strictEqual(good.log.writes.length, 1, 'a valid array must be written')
assert.deepStrictEqual(good.log.writes[0][2], [{ matcher: 'Bash', hooks: [] }])
assert.strictEqual(good.log.writes[0][0], 'settings.json', 'the file must travel to the write')
assert.strictEqual(good.log.err, '', 'a successful save clears the error')
assert.strictEqual(good.log.rawExited, true, 'a successful raw save leaves raw mode')
assert.strictEqual(good.log.changed, 1)
assert.deepStrictEqual(good.log.toasts, [['toastSaved', 'success']])
assert.deepStrictEqual(good.log.matchers, [{ matcher: 'Bash', hooks: [] }])
// an empty array is a real value — it is how the last matcher is removed
const emptied = panel('[]')
await emptied.saveRaw()
assert.deepStrictEqual(emptied.log.writes[0][2], [], 'clearing every matcher must be savable')

// --------------------------------------------------------- persist: a failure
// a read-only settings file or a full disk must not look like a save: the panel
// would keep showing matchers that are not on disk
const failed = panel('[]', () => {
  throw new Error('EACCES: permission denied')
})
const result = await failed.persist([{ matcher: 'Bash', hooks: [] }])
assert.strictEqual(result, false, 'a failed write must report false')
assert.match(failed.log.err, /EACCES/, 'the real error must reach the user')
assert.strictEqual(failed.log.matchers, null, 'a failed write must not advance the matchers')
assert.strictEqual(failed.log.changed, 0, 'a failed write must not fire onChanged')
assert.deepStrictEqual(failed.log.toasts, [], 'a failed write must not toast success')

// and the same failure through saveRaw leaves the user in raw mode with their text
const failedRaw = panel('[]', () => {
  throw new Error('EACCES: permission denied')
})
await failedRaw.saveRaw()
assert.strictEqual(failedRaw.log.rawExited, false, 'a failed save must not discard the raw draft')

// ---------------------------------------------------------------- fileTag
const sidebarSrc = await read('src/renderer/src/components/Sidebar.tsx')
const { fileTag } = load(grab(sidebarSrc, 'fileTag'), ['fileTag'])
assert.strictEqual(fileTag('scripts/run.py'), 'py')
assert.strictEqual(fileTag('data.markdown'), 'mark', 'the extension label is cut to 4 chars')
assert.strictEqual(fileTag('Makefile'), '·', 'a name without an extension gets a dot')

// ----------------------------------------------------------- dropInFolder
// a closure over Sidebar state, lifted with its bindings injected like the hook panel
function grabIndented(text, name) {
  const start = text.search(new RegExp(`(async )?function ${name}\\(`))
  assert.notStrictEqual(start, -1, `${name} not found — re-point this check`)
  const end = text.indexOf('\n  }\n', start)
  assert.notStrictEqual(end, -1, `could not find the end of ${name}`)
  return text.slice(start, end + 5)
}
const mkDrop = new Function(
  'drag',
  'assistantId',
  'assignFolder',
  'setDrag',
  'setOrderTick',
  `${transformSync(grabIndented(sidebarSrc, 'dropInFolder'), { loader: 'ts' }).code}\nreturn dropInFolder`
)
function dropper(drag) {
  const log = { assigned: [], dragCleared: 0, ticks: 0 }
  const fn = mkDrop(
    drag,
    'a',
    (...args) => log.assigned.push(args),
    (v) => v === null && log.dragCleared++,
    () => log.ticks++
  )
  return { fn, log }
}
const cross = dropper({ path: '/a/agent.md', group: 'agents' })
cross.fn('skills', 'work')
assert.deepStrictEqual(cross.log.assigned, [], 'a drag from another group must not be assigned')
assert.strictEqual(cross.log.dragCleared, 1, 'the ignored drag is still cleared')
assert.strictEqual(cross.log.ticks, 0)
const same = dropper({ path: '/a/s/SKILL.md', group: 'skills' })
same.fn('skills', 'work')
assert.deepStrictEqual(same.log.assigned, [['a', 'skills', '/a/s/SKILL.md', 'work']])

// ------------------------------------------------- newFolder / dropFolder
// a blank name closes the input without creating a folder, and a cancelled
// confirm leaves the folder where it is
const mkNewFolder = new Function(
  'assistantId',
  'addFolder',
  'setNamingFolder',
  'setOrderTick',
  `${transformSync(grabIndented(sidebarSrc, 'newFolder'), { loader: 'ts' }).code}\nreturn newFolder`
)
const nf = { added: [], naming: [], ticks: 0 }
const newFolder = mkNewFolder(
  'a',
  (...args) => nf.added.push(args),
  (v) => nf.naming.push(v),
  () => nf.ticks++
)
newFolder('skills', '   ')
assert.deepStrictEqual(nf.added, [], 'a blank name must not create a folder')
assert.deepStrictEqual(nf.naming, [null], 'but the name input still closes')
assert.strictEqual(nf.ticks, 0)
newFolder('skills', 'work')
assert.deepStrictEqual(nf.added, [['a', 'skills', 'work']])

const mkDropFolder = new Function(
  'assistantId',
  'confirm',
  'ti',
  'removeFolder',
  'setOrderTick',
  `${transformSync(grabIndented(sidebarSrc, 'dropFolder'), { loader: 'ts' }).code}\nreturn dropFolder`
)
function folderRemover(answer) {
  const log = { removed: [], ticks: 0 }
  const fn = mkDropFolder(
    'a',
    () => answer,
    (k) => k,
    (...args) => log.removed.push(args),
    () => log.ticks++
  )
  return { fn, log }
}
const cancelled = folderRemover(false)
cancelled.fn('skills', 'work')
assert.deepStrictEqual(cancelled.log.removed, [], 'a cancelled confirm must not remove the folder')
assert.strictEqual(cancelled.log.ticks, 0)
const confirmed = folderRemover(true)
confirmed.fn('skills', 'work')
assert.deepStrictEqual(confirmed.log.removed, [['a', 'skills', 'work']])

// ----------------------------------------------- HookPanel: raw draft seed
// the panel opens in raw mode with the event's matchers already in the box, so
// saving without an edit must write back exactly what was loaded
const { asMatchers } = load(grab(hookSrc, 'asMatchers'), ['asMatchers'])
const matchers = [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi', timeout: 5 }] }]
assert.deepStrictEqual(JSON.parse(JSON.stringify(asMatchers(matchers), null, 2)), matchers)
assert.deepStrictEqual(asMatchers({ not: 'a list' }), [], 'a malformed event opens as an empty list')
assert.deepStrictEqual(asMatchers(undefined), [])

// ------------------------------------------------------- Editor: isPlain
// the load effect decides the opening mode; lifted whole with its setters stubbed
const effStart = editorSrc.indexOf('useEffect(() => {\n    if (!item?.path)')
assert.notStrictEqual(effStart, -1, 'the Editor load effect moved — re-point this check')
const effEnd = editorSrc.indexOf('}, [item?.path])', effStart)
const effBody = editorSrc.slice(effStart + 'useEffect('.length, effEnd + 1)
const mkEffect = new Function(
  'item',
  'window',
  'parse',
  'setFm',
  'setOrder',
  'setBody',
  'setRawText',
  'setOriginal',
  'setMode',
  `return (${transformSync(effBody, { loader: 'ts' }).code.trim().replace(/;$/, '')})`
)
async function openMode(p) {
  let mode = null
  const noop = () => {}
  const read = Promise.resolve('text')
  mkEffect(
    { path: p },
    { api: { readResource: () => read } },
    () => ({ fm: {}, order: [], body: '' }),
    noop,
    noop,
    noop,
    noop,
    noop,
    (m) => (mode = m)
  )()
  await read
  await Promise.resolve()
  return mode
}
assert.strictEqual(await openMode('/a/.claude/hooks/guard.py'), 'raw', 'a script opens raw')
assert.strictEqual(await openMode('/a/settings.json'), 'raw')
assert.strictEqual(await openMode('/a/SKILL.md'), 'edit', 'markdown opens in the form editor')
assert.strictEqual(await openMode('/a/rule.MDC'), 'edit')

// --------------------------------------------------- Editor: previewHtml
const pvStart = editorSrc.indexOf('const previewHtml = useMemo(')
assert.notStrictEqual(pvStart, -1, 'previewHtml moved — re-point this check')
const pvEnd = editorSrc.indexOf('}, [current, mode])', pvStart)
const pvFn = editorSrc.slice(pvStart + 'const previewHtml = useMemo('.length, pvEnd + 1)
const mkPreview = new Function(
  'mode',
  'current',
  'parse',
  'renderMarkdown',
  `return (${transformSync(pvFn, { loader: 'ts' }).code.trim().replace(/;$/, '')})()`
)
let rendered = 0
const render = () => (rendered++, '<p>x</p>')
assert.strictEqual(mkPreview('raw', '# x', () => ({ body: '# x' }), render), '', 'no render outside preview')
assert.strictEqual(mkPreview('edit', '# x', () => ({ body: '# x' }), render), '')
assert.strictEqual(rendered, 0, 'markdown must not be rendered outside preview')
assert.strictEqual(mkPreview('preview', '# x', () => ({ body: '# x' }), render), '<p>x</p>')

// ---------------------------------------------------------- renderGrouped
// the folder layout of a group: a closure over Sidebar state with JSX, so it is
// lifted with a stub JSX factory and every binding injected. renderItem is
// stubbed to record which item landed where and whether it was drawn in a folder.
const mkGrouped = new Function(
  'h',
  'searching',
  'FOLDERABLE',
  'getFolders',
  'assistantId',
  'collapsedFolders',
  'renderItem',
  'dropInFolder',
  'dropFolder',
  'setCollapsedFolders',
  'namingFolder',
  'newFolder',
  'setNamingFolder',
  't',
  `${transformSync(grabIndented(sidebarSrc, 'renderGrouped'), {
    loader: 'tsx',
    jsx: 'transform',
    jsxFactory: 'h'
  }).code}\nreturn renderGrouped`
)
const FOLDERABLE_SRC = sidebarSrc.match(/const FOLDERABLE = (new Set\([^)]*\))/)
assert.ok(FOLDERABLE_SRC, 'FOLDERABLE not found — re-point this check')
const FOLDERABLE = new Function(`return ${FOLDERABLE_SRC[1]}`)()
function grouped({ searching = false, folders = { names: [], of: {} }, shut = {} } = {}) {
  const h = (type, props) => ({ type, props: props || {} })
  const renderItem = (item, _tag, _ctx, inFolder = false) => ({ item: item.name, inFolder })
  const fn = mkGrouped(
    h, searching, FOLDERABLE, () => folders, 'a', shut, renderItem,
    () => {}, () => {}, () => {}, null, () => {}, () => {}, (k) => k
  )
  // a flat trace: `folder:<name>`, `loose-drop`, or `<item>` / `<item>@folder`
  return (def, items) =>
    fn({ key: def, label: def, tag: 'md' }, items).flatMap((el) => {
      if ('item' in el) return [el.inFolder ? `${el.item}@folder` : el.item]
      const k = el.props.key
      if (k === 'new-folder') return []
      return [k]
    })
}
const res = (name, extra = {}) => ({ name, kind: 'skill', path: `/s/${name}/SKILL.md`, ...extra })
const child = (name, parent) => ({
  name,
  kind: 'file',
  path: `/s/${parent}/${name}`,
  meta: { under: `/s/${parent}/SKILL.md` }
})

// items go to their own folder
{
  const draw = grouped({
    folders: { names: ['work', 'home'], of: { '/s/a/SKILL.md': 'work', '/s/b/SKILL.md': 'home' } }
  })
  assert.deepStrictEqual(
    draw('skills', [res('a'), res('b')]),
    ['folder:work', 'a@folder', 'folder:home', 'b@folder', 'loose-drop'],
    'each item must be drawn under the folder it is assigned to'
  )
}

// no folder, or a folder that no longer exists, lands in the loose list
{
  const draw = grouped({ folders: { names: ['work'], of: { '/s/b/SKILL.md': 'gone' } } })
  assert.deepStrictEqual(
    draw('skills', [res('a'), res('b'), { name: 'c', kind: 'skill' }]),
    ['folder:work', 'loose-drop', 'a', 'b', 'c'],
    'unassigned, unknown-folder and path-less items belong to the loose list'
  )
}

// a side file follows its parent, inside a folder and in the loose list
{
  const draw = grouped({ folders: { names: ['work'], of: { '/s/a/SKILL.md': 'work' } } })
  assert.deepStrictEqual(
    draw('skills', [child('a.py', 'a'), res('a'), child('b.py', 'b'), res('b')]),
    ['folder:work', 'a@folder', 'a.py@folder', 'loose-drop', 'b', 'b.py'],
    'a file must be drawn right after the item named by meta.under'
  )
  // a file is never a folder member on its own, so the folder count leaves it out
  const h = (type, props, ...children) => ({ type, props: props || {}, children })
  const fn = mkGrouped(
    h, false, FOLDERABLE, () => ({ names: ['work'], of: { '/s/a/SKILL.md': 'work' } }), 'a', {},
    (item) => ({ item: item.name }), () => {}, () => {}, () => {}, null, () => {}, () => {}, (k) => k
  )
  const header = fn({ key: 'skills', label: 'Skills', tag: 'md' }, [res('a'), child('a.py', 'a')])[0]
  const count = header.children.find((c) => c && c.props && c.props.className === 'count')
  assert.deepStrictEqual(count.children, [1], 'the folder count must not include side files')
}

// searching draws a flat list with no folders
{
  const draw = grouped({ searching: true, folders: { names: ['work'], of: { '/s/a/SKILL.md': 'work' } } })
  assert.deepStrictEqual(
    draw('skills', [res('a'), child('a.py', 'a'), res('b')]),
    ['a', 'a.py', 'b'],
    'a search result must skip folders and keep the given order'
  )
}

// a group outside FOLDERABLE never shows folders
{
  assert.ok(!FOLDERABLE.has('hooks'))
  const draw = grouped({ folders: { names: ['work'], of: { '/h/x': 'work' } } })
  assert.deepStrictEqual(
    draw('hooks', [{ name: 'x', kind: 'hook', path: '/h/x' }, { name: 'y', kind: 'hook', path: '/h/y' }]),
    ['x', 'y'],
    'hooks must render flat even when folder state exists'
  )
}

// ------------------------------------------------------- renderItem canDrag
// a side file can be neither reordered nor dropped into a folder
{
  const line = sidebarSrc.match(/const canDrag = ([^\n]+)/)
  assert.ok(line, 'canDrag not found in renderItem — re-point this check')
  const canDrag = new Function('dragCtx', 'item', `return ${line[1]}`)
  const ctx = { group: 'skills', items: [] }
  assert.strictEqual(canDrag(ctx, { kind: 'skill', path: '/s/a/SKILL.md' }), true)
  assert.strictEqual(canDrag(ctx, { kind: 'file', path: '/s/a/a.py' }), false, 'a file must not be draggable')
  assert.strictEqual(canDrag(undefined, { kind: 'skill', path: '/s/a/SKILL.md' }), false)
  assert.strictEqual(canDrag(ctx, { kind: 'skill' }), false)
}

// --------------------------------------------------- group header count
// the count beside a group label counts resources, not their side files
{
  const expr = sidebarSrc.match(
    /className="group-header"[\s\S]*?<span className="count">\{([^\n]+)\}<\/span>/
  )
  assert.ok(expr, 'the group header count was not found — re-point this check')
  const count = new Function('items', `return ${expr[1]}`)
  assert.strictEqual(count([res('a'), child('a.py', 'a'), child('b.sh', 'a'), res('b')]), 2)
}

console.log('ok — renderer helpers: lint, promptVars, fillVars, fmtSize, hook raw-mode guards, fileTag, dropInFolder, renderGrouped, canDrag, group count, editor mode')
