// Self-check for assistant publishing: credentials never reach a commit, the
// repository URL can never be read as a git option, and PATH survives a Finder
// launch.
// Run: node scripts/check-git.mjs
import { buildSync } from 'esbuild'
import { promises as fs } from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import assert from 'assert'

const pexec = promisify(execFile)
const root = path.join(import.meta.dirname, '..')
const out = path.join(os.tmpdir(), `archo-git-${Date.now()}.mjs`)
// the JS API, not the .bin shim — that shim is esbuild.cmd on Windows
buildSync({
  entryPoints: [path.join(root, 'src/main/git.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out
})
const { publishAssistant, repoInfo, setRemote, cloneAssistant, gitBranch } = await import(
  pathToFileURL(out).href
)

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archo-git-'))
// the code under test commits with the inherited environment, so pin git's
// whole configuration to a throwaway file: no host identity, no signing
const gitConfig = path.join(tmp, 'gitconfig')
await fs.writeFile(
  gitConfig,
  '[user]\n\tname = Archo Test\n\temail = test@archo.local\n[commit]\n\tgpgsign = false\n'
)
process.env.GIT_CONFIG_GLOBAL = gitConfig
process.env.GIT_CONFIG_SYSTEM = path.join(tmp, 'no-system-gitconfig')
const ident = [
  '-c',
  'user.name=Archo Test',
  '-c',
  'user.email=test@archo.local',
  '-c',
  'commit.gpgsign=false'
]
const raw = (dir, args) => pexec('git', ['-C', dir, ...ident, ...args]).then((r) => r.stdout)

async function newRepo(name) {
  const dir = path.join(tmp, name)
  await fs.mkdir(dir, { recursive: true })
  await raw(dir, ['init', '-b', 'main'])
  return dir
}

// ---------------------------------------------------------------- publish:
// a credential committed before the ignore rules existed must be un-tracked
const dir = await newRepo('secrets')
await fs.mkdir(path.join(dir, '.claude'), { recursive: true })
await fs.writeFile(path.join(dir, '.claude', 'settings.local.json'), '{"token":"sk-secret"}')
await fs.writeFile(path.join(dir, '.env'), 'API_KEY=sk-secret')
await fs.writeFile(path.join(dir, 'CLAUDE.md'), 'hello')
await raw(dir, ['add', '-A'])
await raw(dir, ['commit', '-m', 'before the rules existed'])
assert.ok(
  (await raw(dir, ['ls-files'])).includes('.env'),
  'precondition: the secret starts out tracked'
)

const first = await publishAssistant(dir, 'publish')
assert.strictEqual(first.committed, true)
const tracked = await raw(dir, ['ls-files'])
assert.ok(!tracked.includes('.env'), '.env must be dropped from the index')
assert.ok(!tracked.includes('settings.local.json'), 'local settings must be dropped')
assert.ok(tracked.includes('CLAUDE.md'), 'the assistant itself still travels')
// and the working-tree file is untouched — un-tracking is not deleting
assert.ok(await fs.readFile(path.join(dir, '.env'), 'utf8'))

// ------------------------------------------------------- publish: gitignore
const ig = await fs.readFile(path.join(dir, '.gitignore'), 'utf8')
for (const rule of ['.mcp.json', '.env', '.env.*', 'node_modules/', '.DS_Store'])
  assert.ok(ig.split('\n').includes(rule), `missing ignore rule ${rule}`)

// an existing .gitignore keeps its content and only gains the missing rules
const keep = await newRepo('ignore-merge')
await fs.writeFile(path.join(keep, '.gitignore'), 'dist/\n.env\n') // no trailing-newline problem
await fs.writeFile(path.join(keep, 'CLAUDE.md'), 'x')
await publishAssistant(keep, 'publish')
const merged = await fs.readFile(path.join(keep, '.gitignore'), 'utf8')
assert.ok(merged.startsWith('dist/\n.env\n'), 'the existing .gitignore must be preserved')
assert.strictEqual(merged.split('\n').filter((l) => l === '.env').length, 1, '.env added twice')
assert.ok(merged.includes('node_modules/'), 'a missing rule must be appended')
// a second publish has nothing left to add
await publishAssistant(keep, 'publish again')
assert.strictEqual(
  await fs.readFile(path.join(keep, '.gitignore'), 'utf8'),
  merged,
  'a second publish must append nothing'
)

// a file not ending in a newline gets the separator prefix, so the first
// appended rule does not glue onto the last existing line
const nonl = await newRepo('ignore-nonewline')
await fs.writeFile(path.join(nonl, '.gitignore'), 'dist/')
await fs.writeFile(path.join(nonl, 'CLAUDE.md'), 'x')
await publishAssistant(nonl, 'publish')
const nonlOut = await fs.readFile(path.join(nonl, '.gitignore'), 'utf8')
assert.ok(nonlOut.split('\n').includes('dist/'), 'the last line must not be glued to a new rule')

// --------------------------------------------- publish: a still-tracked secret
// `git rm --cached` refuses when the staged content differs, so publish must
// throw rather than commit. Reproduce by staging the secret after the rules.
const armed = await newRepo('armed')
await fs.writeFile(path.join(armed, 'CLAUDE.md'), 'x')
await fs.writeFile(path.join(armed, '.env'), 'API_KEY=sk-secret')
await raw(armed, ['add', '-f', '.env', 'CLAUDE.md'])
await raw(armed, ['commit', '-m', 'seed'])
await fs.writeFile(path.join(armed, '.env'), 'API_KEY=sk-rotated') // staged != worktree
await raw(armed, ['add', '-f', '.env'])
let threw = null
try {
  await publishAssistant(armed, 'publish')
} catch (e) {
  threw = e
}
if (threw) {
  assert.match(String(threw.message), /refusing to commit tracked local files/)
  assert.match(String(threw.message), /\.env/)
} else {
  // the rm --cached succeeded, which is the other acceptable outcome — but then
  // the secret must genuinely be gone from the index
  assert.ok(!(await raw(armed, ['ls-files'])).includes('.env'), 'secret survived into the index')
}

// -------------------------------------------- publish: unborn HEAD branch name
// a first publish with nothing to stage cannot use rev-parse — symbolic-ref is
// the only thing that answers on an unborn HEAD
const empty = path.join(tmp, 'unborn')
await fs.mkdir(empty, { recursive: true })
// every rule already present and the ignore file ignoring itself, so `add -A`
// finds nothing to stage and HEAD is still unborn when the branch is read
await fs.writeFile(
  path.join(empty, '.gitignore'),
  ['.gitignore', '.mcp.json', '**/.claude/settings.local.json', '**/.claude/logs/', '.env', '.env.*', '.DS_Store', 'node_modules/'].join('\n') + '\n'
)
const unborn = await publishAssistant(empty, 'publish')
assert.strictEqual(unborn.committed, false, 'nothing was staged, so nothing was committed')
assert.strictEqual(unborn.branch, 'main', 'the branch name must survive an unborn HEAD')

// ---------------------------------------------------------------- repoInfo
const info = await repoInfo(dir)
assert.strictEqual(info.isRepo, true)
assert.strictEqual(info.branch, 'main')
// no upstream: every local commit counts as unpublished
assert.strictEqual(info.ahead, parseInt((await raw(dir, ['rev-list', '--count', 'HEAD'])).trim(), 10))
assert.ok(info.ahead >= 2, 'the fallback counts the whole history, not zero')
assert.strictEqual(info.remote, undefined, 'no origin yet')

// with an upstream, ahead is the left side of the left-right count
const bare = path.join(tmp, 'origin.git')
await pexec('git', ['init', '--bare', '-b', 'main', bare])
await setRemote(dir, bare)
await raw(dir, ['push', '-u', 'origin', 'main'])
assert.strictEqual((await repoInfo(dir)).ahead, 0, 'in sync with upstream means ahead 0')
await fs.writeFile(path.join(dir, 'CLAUDE.md'), 'changed')
await raw(dir, ['commit', '-am', 'one ahead'])
assert.strictEqual((await repoInfo(dir)).ahead, 1, 'one unpushed commit means ahead 1')
assert.strictEqual((await repoInfo(dir)).dirty, false)

// a non-repo answers with isRepo false and nothing else
const plain = path.join(tmp, 'not-a-repo')
await fs.mkdir(plain, { recursive: true })
assert.deepStrictEqual(await repoInfo(plain), { isRepo: false })
assert.deepStrictEqual(await gitBranch(''), { isRepo: false })

// ---------------------------------------------------------------- setRemote
// a fresh repo takes `remote add`, an existing origin takes `remote set-url`
const rem = await newRepo('remote')
await setRemote(rem, 'https://example.com/a.git')
assert.strictEqual((await raw(rem, ['remote', 'get-url', 'origin'])).trim(), 'https://example.com/a.git')
await setRemote(rem, 'https://example.com/b.git')
assert.strictEqual((await raw(rem, ['remote', 'get-url', 'origin'])).trim(), 'https://example.com/b.git')
assert.strictEqual((await raw(rem, ['remote'])).trim(), 'origin', 'set-url, not a second remote')
// the URL that lands is the trimmed, validated one
await setRemote(rem, '  https://example.com/c.git  ')
assert.strictEqual((await raw(rem, ['remote', 'get-url', 'origin'])).trim(), 'https://example.com/c.git')

// ------------------------------------------------------------- assertRepoUrl
// reached through its two call sites — an argument starting with '-' would be
// read as an option, and --upload-pack runs an arbitrary command
const evil = [
  '--upload-pack=touch /tmp/pwn',
  '--config=core.sshCommand=touch /tmp/pwn',
  '-u',
  '',
  '   ',
  'not a url with spaces'
]
for (const u of evil) {
  await assert.rejects(
    () => setRemote(rem, u),
    /unsupported repository URL/,
    `setRemote accepted ${JSON.stringify(u)}`
  )
  await assert.rejects(
    () => cloneAssistant(u, path.join(tmp, 'never')),
    /unsupported repository URL/,
    `cloneAssistant accepted ${JSON.stringify(u)}`
  )
}
const good = [
  'https://github.com/o/r.git',
  'http://example.com/r.git',
  'git://example.com/r.git',
  'ssh://git@example.com/o/r.git',
  'file:///tmp/r.git',
  '/abs/path/r.git',
  'C:\\path\\r.git',
  '\\\\unc\\share\\r.git',
  'git@github.com:o/r.git'
]
for (const u of good)
  await setRemote(rem, u) // throws if rejected
assert.strictEqual((await raw(rem, ['remote', 'get-url', 'origin'])).trim(), good[good.length - 1])

// ------------------------------------------------------------- cloneAssistant
const cloneTarget = path.join(tmp, 'cloned')
await cloneAssistant(bare, cloneTarget)
assert.ok(await fs.readFile(path.join(cloneTarget, 'CLAUDE.md'), 'utf8'), 'clone produced no work tree')
// the `--` separator belongs in the argv itself: it is what keeps a URL out of
// option position even if the regex above is ever loosened
const src = await fs.readFile(path.join(root, 'src/main/git.ts'), 'utf8')
assert.match(src, /\['clone',\s*'--',/, "the clone argv lost its '--' separator")

// ------------------------------------------------------------ the git helper
// launched from Finder the app inherits a bare PATH; every git call goes
// through withPath, so a stripped PATH must still resolve git
const savedPath = process.env.PATH
try {
  process.env.PATH = ''
  const bareEnv = await gitBranch(dir)
  assert.strictEqual(bareEnv.isRepo, true, 'git was unresolvable with an empty PATH')
  assert.strictEqual(bareEnv.branch, 'main')
} finally {
  process.env.PATH = savedPath
}

await fs.rm(tmp, { recursive: true, force: true })
await fs.rm(out, { force: true })
console.log('ok — git publishing and URL validation')
