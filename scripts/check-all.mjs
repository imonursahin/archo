// Runs every scripts/check-*.mjs, in Node rather than in a shell — npm runs its
// scripts through cmd.exe on Windows, which cannot parse a POSIX for-loop.
// Run: node scripts/check-all.mjs   (or: npm run check)
import { readdirSync } from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'

const dir = import.meta.dirname
const checks = readdirSync(dir)
  .filter((f) => f.startsWith('check-') && f.endsWith('.mjs') && f !== 'check-all.mjs')
  .sort()

let failed = 0
for (const f of checks) {
  try {
    execFileSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' })
  } catch {
    failed++
    console.error(`FAILED: ${f}`)
  }
}
if (failed) {
  console.error(`${failed}/${checks.length} checks failed`)
  process.exit(1)
}
console.log(`${checks.length} checks passed`)
