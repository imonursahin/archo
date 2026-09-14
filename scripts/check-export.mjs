// Self-check for the export bundle filter: machine-local files stay home,
// binary and oversized files are reported instead of vanishing.
// Run: node scripts/check-export.mjs
import { buildSync } from 'esbuild'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import assert from 'assert'

const root = path.join(import.meta.dirname, '..')
const out = path.join(os.tmpdir(), `archo-assistants-${Date.now()}.mjs`)
// the JS API, not the .bin shim — that shim is esbuild.cmd on Windows
buildSync({
  entryPoints: [path.join(root, 'src/main/assistants.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out
})
const { setStorePath, exportAssistant } = await import(pathToFileURL(out).href)

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'archo-export-'))
const baseDir = path.join(tmp, 'assistant')
await fs.mkdir(path.join(baseDir, '.claude', 'logs'), { recursive: true })
await fs.mkdir(path.join(baseDir, '.claude', 'skills', 'demo'), { recursive: true })
await fs.writeFile(path.join(baseDir, 'CLAUDE.md'), 'hello')
await fs.writeFile(path.join(baseDir, '.claude', 'skills', 'demo', 'SKILL.md'), 'skill')
await fs.writeFile(path.join(baseDir, '.claude', 'settings.json'), '{}')
await fs.writeFile(
  path.join(baseDir, '.mcp' + '.json'),
  JSON.stringify({ mcpServers: { api: { command: 'npx', env: { API_KEY: 'sk-secret' } } } })
)
await fs.writeFile(path.join(baseDir, '.claude', 'settings.local.json'), '{"permissions":"secret"}')
await fs.writeFile(path.join(baseDir, '.claude', 'logs', 'run.log'), 'noise')
await fs.writeFile(path.join(baseDir, '.env'), 'TOKEN=secret')
await fs.writeFile(path.join(baseDir, 'icon.png'), Buffer.from([0x89, 0x50, 0x00, 0x01]))
await fs.writeFile(path.join(baseDir, 'big.md'), 'x'.repeat(600 * 1024))

const store = path.join(tmp, 'assistants.json')
await fs.writeFile(
  store,
  JSON.stringify({
    assistants: [
      { id: 'demo', name: 'Demo', icon: '🤖', engineId: 'claude', baseDir, createdAt: 1 }
    ]
  })
)
setStorePath(store)

const bundle = await exportAssistant('demo')
const files = Object.keys(bundle.files).sort()

const mcpRel = '.mcp' + '.json'
assert.deepStrictEqual(files, [
  '.claude/settings.json',
  '.claude/skills/demo/SKILL.md',
  mcpRel,
  'CLAUDE.md'
])
assert.deepStrictEqual(bundle.dropped.sort(), ['big.md', 'icon.png'])

// the MCP server list travels, its API keys do not
const mcp = JSON.parse(bundle.files[mcpRel])
assert.strictEqual(mcp.mcpServers.api.command, 'npx')
assert.strictEqual(mcp.mcpServers.api.env.API_KEY, '')
assert.ok(!bundle.files[mcpRel].includes('sk-secret'), 'API key leaked into the bundle')

await fs.rm(tmp, { recursive: true, force: true })
await fs.rm(out, { force: true })
console.log('ok — export bundle filter')
