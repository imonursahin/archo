// Self-check for the i18n dictionary: every t('…')/ti('…') key the renderer
// asks for exists in DICT, and every DICT entry carries both languages. A key
// that is renamed in one place only type-checks and builds — t() falls back to
// String(key) (i18n.ts), so the UI silently shows a raw identifier like
// "toastMemoriesCleared" to the user, and only that exact screen reveals it. An
// entry with an empty `tr` is the same failure in Turkish alone, which an
// English-default run never hits. Assert both by loading the real DICT.
// Run: node scripts/check-i18n-parity.mjs
import { transformSync } from 'esbuild'
import { readFileSync, readdirSync } from 'fs'
import path from 'path'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const rendererSrc = path.join(root, 'src/renderer/src')
const i18nRel = 'src/renderer/src/lib/i18n.ts'

// ------------------------------------------------------------- the real DICT
// Not a re-parse of the source text: the module is compiled and run, so a DICT
// that changes shape is the DICT this check inspects. Module scope reads
// localStorage for the stored language, which Node has no notion of.
const i18nSrc = readFileSync(path.join(root, i18nRel), 'utf8')
const js = transformSync(i18nSrc.replace(/^export /gm, ''), { loader: 'ts' }).code
const { DICT, t } = new Function(
  'localStorage',
  `${js}\nreturn { DICT, t }`
)({ getItem: () => null, setItem: () => {} })

const keys = Object.keys(DICT)
assert.ok(keys.length > 300, `DICT loaded with only ${keys.length} entries — this check is stale`)

// ------------------------------------------------- every entry has both langs
// en is the fallback t() returns when the current language is missing, so an
// empty en leaves nothing at all to render.
const blank = keys
  .filter((k) => !String(DICT[k]?.en ?? '').trim() || !String(DICT[k]?.tr ?? '').trim())
  .sort()
assert.deepStrictEqual(blank, [], `DICT entries missing an en or tr string: ${blank.join(', ')}`)

// ------------------------------------------------------- every usage resolves
// strip comments so a key named only in prose never counts as a real call; the
// [^:] guard keeps "https://" from reading as a line comment
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const files = []
;(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.tsx?$/.test(e.name)) files.push(p)
  }
})(rendererSrc)

// only literal keys can be checked statically; ti(someVar, …) is skipped
const used = new Map() // key -> first file that asks for it
for (const file of files) {
  if (path.relative(root, file) === i18nRel) continue
  for (const m of strip(readFileSync(file, 'utf8')).matchAll(/\bti?\(\s*'([^']+)'/g))
    if (!used.has(m[1])) used.set(m[1], path.relative(root, file))
}
assert.ok(used.size > 300, `renderer scan found only ${used.size} t() keys — regex is stale`)

const unresolved = [...used].filter(([k]) => !(k in DICT)).map(([k, f]) => `${k} (${f})`).sort()
assert.deepStrictEqual(
  unresolved,
  [],
  `renderer asks for keys DICT does not define, so the UI renders the raw key: ${unresolved.join(', ')}`
)

// ------------------------------------------------------------ the miss itself
// The fallback above is what makes a missing key invisible; pin it so the
// parity assertion above keeps describing a real failure mode.
assert.strictEqual(t('noSuchKeyAnywhere'), 'noSuchKeyAnywhere', 't() must fall back to the key')

console.log(`ok — i18n parity (${keys.length} entries, ${used.size} keys used, en+tr non-empty)`)
