// Self-check that startClaude tears its popup down before it opens a terminal.
// The popup is positioned `position: fixed` against the button's client rect,
// so it is painted over whatever is below it. If startRect survives the click,
// the popup keeps floating above the terminal that was just created — and the
// order is the whole of the fix: both statements run either way, so a swap
// type-checks, builds, and is visible only by clicking Start Claude and looking.
// The function's real source is lifted out and run, not copied: if startClaude
// changes, this check runs the changed version.
// Run: node scripts/check-popup-teardown.mjs
import { transformSync } from 'esbuild'
import { readFileSync } from 'fs'
import path from 'path'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const src = readFileSync(path.join(root, 'src/renderer/src/components/SessionTools.tsx'), 'utf8')

// a nested function of the component, so its body ends at the first brace
// closing in column 2
const start = src.indexOf('function startClaude(')
assert.notStrictEqual(start, -1, 'startClaude is no longer a nested function — re-point this check')
const end = src.indexOf('\n  }\n', start)
assert.notStrictEqual(end, -1, 'could not find the end of startClaude')
const snippet = src.slice(start, end + 5)
assert.ok(
  /setStartRect\(/.test(snippet) && /onNewTerminal\(/.test(snippet),
  'startClaude no longer names both setStartRect and onNewTerminal — re-point this check'
)

const mk = new Function(
  'setStartRect',
  'onNewTerminal',
  'claudeArgs',
  `${transformSync(snippet, { loader: 'ts' }).code}\nreturn startClaude`
)

const log = []
mk(
  (v) => log.push(`setStartRect:${v}`),
  (opts) => log.push(`onNewTerminal:${opts.name}`),
  () => ''
)()

// ----------------------------------------------------------- the popup closes
assert.ok(log.includes('setStartRect:null'), 'startClaude must clear startRect to close the popup')

// --------------------------------------------------------- the terminal opens
assert.ok(log.includes('onNewTerminal:claude'), 'startClaude must still open the claude terminal')

// ------------------------------------------------------------- and in that order
assert.deepStrictEqual(
  log,
  ['setStartRect:null', 'onNewTerminal:claude'],
  'the popup must be torn down BEFORE the terminal is created, or it floats over it'
)

console.log('ok — startClaude closes its popup before opening the terminal')
