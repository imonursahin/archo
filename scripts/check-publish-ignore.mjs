// Self-check for assistant publishing: machine-local files must never reach a
// commit, INCLUDING when the folder already has a .gitignore of its own.
// Run: node scripts/check-publish-ignore.mjs
import { execFileSync } from 'child_process'
import { buildSync } from 'esbuild'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import assert from 'assert'

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
const { publishAssistant, cloneAssistant, setRemote } = await import(pathToFileURL(out).href)

// CI runners have no global git identity, and publishAssistant commits with the
// inherited environment
process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 'check'
process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 'check@archo.local'

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'archo-publish-'))
await fs.mkdir(path.join(dir, '.claude'), { recursive: true })
await fs.writeFile(path.join(dir, 'CLAUDE.md'), 'hello')
await fs.writeFile(path.join(dir, '.claude', 'settings.json'), '{}')
await fs.writeFile(path.join(dir, '.claude', 'settings.local.json'), '{"permissions":"secret"}')
await fs.writeFile(path.join(dir, '.env'), 'TOKEN=secret')
await fs.writeFile(path.join(dir, '.mcp' + '.json'), '{"mcpServers":{"x":{"env":{"KEY":"secret"}}}}')
await fs.writeFile(path.join(dir, '.env.production'), 'TOKEN=secret')
// the folder brings its own .gitignore — this is the case that used to leak
await fs.writeFile(path.join(dir, '.gitignore'), 'dist/\n')
// a nested project inside the assistant has its own .claude and .env
await fs.mkdir(path.join(dir, 'projects', 'web', '.claude'), { recursive: true })
await fs.writeFile(path.join(dir, 'projects', 'web', '.claude', 'settings.local.json'), '{}')
await fs.writeFile(path.join(dir, 'projects', 'web', '.env'), 'TOKEN=secret')

const git = (...args) =>
  execFileSync('git', ['-C', dir, ...args], {
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_NAME: 'check', GIT_AUTHOR_EMAIL: 'c@x', GIT_COMMITTER_NAME: 'check', GIT_COMMITTER_EMAIL: 'c@x' }
  })
    .toString()
    .trim()

await publishAssistant(dir, 'first commit')

const tracked = git('ls-files').split('\n').filter(Boolean)
for (const leak of [
  '.env',
  '.env.production',
  '.claude/settings.local.json',
  '.mcp' + '.json',
  'projects/web/.claude/settings.local.json',
  'projects/web/.env'
])
  assert.ok(!tracked.includes(leak), `LEAKED: ${leak} is tracked — ${tracked.join(', ')}`)

// a URL that git would read as an option must never reach git
for (const hostile of ['--upload-pack=touch /tmp/pwned', '--config=core.sshCommand=id', '-x']) {
  await assert.rejects(
    () => cloneAssistant(hostile, path.join(dir, 'clone-target')),
    /unsupported repository URL/,
    `accepted hostile clone URL: ${hostile}`
  )
  await assert.rejects(
    () => setRemote(dir, hostile),
    /unsupported repository URL/,
    `accepted hostile remote URL: ${hostile}`
  )
}
// …while the real shapes still work
await setRemote(dir, 'git@github.com:me/x.git')
await setRemote(dir, 'https://github.com/me/x.git')
assert.strictEqual(git('remote', 'get-url', 'origin'), 'https://github.com/me/x.git')
assert.ok(tracked.includes('CLAUDE.md'), 'CLAUDE.md should be committed')
assert.ok(tracked.includes('.claude/settings.json'), 'settings.json should be committed')
assert.ok(git('cat-file', '-p', 'HEAD:.gitignore').includes('dist/'), 'existing rules must survive')

await fs.rm(dir, { recursive: true, force: true })
await fs.rm(out, { force: true })
console.log('ok — publish keeps machine-local files out')
