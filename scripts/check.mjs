import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { PROVIDER_ID } from '../lib/constants.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')))
assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
assert.equal(PROVIDER_ID, 'qwenwork-community')
if (process.env.GITHUB_REF_TYPE === 'tag') assert.equal(process.env.GITHUB_REF_NAME, 'v' + pkg.version)
function walk(folder) { return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)]) }
for (const file of [...walk(path.join(root, 'lib')), path.join(root, 'index.mjs')]) {
  assert.ok(!file.endsWith('.wasm'))
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}
assert.deepEqual(Object.keys(await import('../index.mjs')), ['QwenWorkPlugin'])
for (const entry of pkg.files) assert.ok(fs.existsSync(path.join(root, entry)), `Missing release file: ${entry}`)
for (const file of walk(path.join(root, 'lib'))) {
  const text = fs.readFileSync(file, 'utf8')
  assert.doesNotMatch(text, /auth-v2\.dat|find-generic-password|Local Storage|\.codex\/|\.config\/magpie\/settings\.json/)
}
console.log(`Checked ${pkg.name}@${pkg.version}; provider ${PROVIDER_ID}; no credential-store imports or vendor binary.`)
