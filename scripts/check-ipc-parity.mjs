// Self-check for the IPC contract: every channel the preload bridge invokes has
// a handler in the main process. A channel with no handler type-checks, builds
// and ships — it fails only at runtime, as an unhandled-invoke rejection raised
// inside whatever click handler called it, so nothing short of clicking that
// exact button finds it. Assert the parity by reading both files instead.
// Run: node scripts/check-ipc-parity.mjs
import { promises as fs } from 'fs'
import path from 'path'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const preloadSrc = await fs.readFile(path.join(root, 'src/preload/index.ts'), 'utf8')
const mainSrc = await fs.readFile(path.join(root, 'src/main/index.ts'), 'utf8')

// strip comments so a channel named only in prose never counts as real
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const all = (src, re) => {
  const out = new Set()
  for (const m of strip(src).matchAll(re)) out.add(m[1])
  return out
}

const invoked = all(preloadSrc, /ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g)
const handled = all(mainSrc, /\bhandle\(\s*['"]([^'"]+)['"]/g)

// the scan itself has to be load-bearing: if either regex stops matching the
// source's shape it would report a clean parity over two empty sets
assert.ok(invoked.size > 50, `preload scan found only ${invoked.size} channels — regex is stale`)
assert.ok(handled.size > 50, `main scan found only ${handled.size} channels — regex is stale`)

// ------------------------------------------------------- every invoke answers
const orphans = [...invoked].filter((c) => !handled.has(c)).sort()
assert.deepStrictEqual(
  orphans,
  [],
  `preload invokes channels that main never handles: ${orphans.join(', ')}`
)

// ------------------------------------------------- no channel handled twice
// ipcMain.handle throws on a duplicate registration, which kills the rest of the
// handler setup — every channel after it silently never registers
const dupes = [...strip(mainSrc).matchAll(/\bhandle\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
const seen = new Set()
const twice = dupes.filter((c) => (seen.has(c) ? true : (seen.add(c), false)))
assert.deepStrictEqual(twice, [], `channel handled more than once: ${twice.join(', ')}`)

// ------------------------------------------- fire-and-forget channels too
// ipcRenderer.send has no reply, so a channel main never listens on fails
// silently: the OSC colour answer or a keystroke simply never arrives
const sent = all(preloadSrc, /ipcRenderer\.send\(\s*['"]([^'"]+)['"]/g)
const listened = all(mainSrc, /ipcMain\.on\(\s*['"]([^'"]+)['"]/g)
assert.ok(sent.size >= 3, `preload send scan found only ${sent.size} channels — regex is stale`)
const unheard = [...sent].filter((c) => !listened.has(c)).sort()
assert.deepStrictEqual(
  unheard,
  [],
  `preload sends channels main never listens on: ${unheard.join(', ')}`
)

console.log(
  `ok — ipc parity (${invoked.size} invoked, ${handled.size} handled, ${sent.size} sent)`
)
