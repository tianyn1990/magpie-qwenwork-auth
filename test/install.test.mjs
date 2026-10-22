import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
test('POSIX installer uses only the supplied sandbox and restores previous files on failure', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qw-install-'))
  const target = path.join(dir, 'plugin target')
  const fake = path.join(dir, 'fake-magpie')
  const log = path.join(dir, 'args')
  fs.writeFileSync(fake, '#!/bin/sh\nprintf "%s\\n" "$@" > "$QWENWORK_TEST_ARGS_LOG"\nexit "${QWENWORK_TEST_EXIT:-0}"\n', { mode: 0o755 })
  const env = { ...process.env, MAGPIE_BIN: fake, QWENWORK_PLUGIN_INSTALL_DIR: target, QWENWORK_TEST_ARGS_LOG: log }
  try {
    const success = spawnSync('/bin/sh', [path.join(root, 'install.sh')], { env, encoding: 'utf8' })
    assert.equal(success.status, 0, success.stderr)
    assert.equal(fs.readFileSync(log, 'utf8'), `plugin\nadd\n${target}\n`)
    assert.ok(fs.existsSync(path.join(target, 'lib/plugin.mjs')))
    assert.equal(fs.existsSync(path.join(target, '.git')), false)
    fs.writeFileSync(path.join(target, 'index.mjs'), '// previous version')
    const failure = spawnSync('/bin/sh', [path.join(root, 'install.sh')], { env: { ...env, QWENWORK_TEST_EXIT: '1' }, encoding: 'utf8' })
    assert.equal(failure.status, 1)
    assert.equal(fs.readFileSync(path.join(target, 'index.mjs'), 'utf8'), '// previous version')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
test('POSIX installer refuses to overwrite an unmanaged directory', { skip: process.platform === 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qw-install-'))
  const target = path.join(dir, 'unmanaged')
  fs.mkdirSync(target)
  fs.writeFileSync(path.join(target, 'keep.txt'), 'keep')
  try {
    const result = spawnSync('/bin/sh', [path.join(root, 'install.sh')], { env: { ...process.env, MAGPIE_BIN: '/bin/true', QWENWORK_PLUGIN_INSTALL_DIR: target }, encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.equal(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'keep')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
test('Windows installer registers only the isolated target', { skip: process.platform !== 'win32' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qw-install-'))
  const target = path.join(dir, 'plugin target')
  const fake = path.join(dir, 'fake-magpie.ps1')
  const log = path.join(dir, 'args.json')
  fs.writeFileSync(fake, '$args | ConvertTo-Json -Compress | Set-Content -LiteralPath $env:QWENWORK_TEST_ARGS_LOG\nexit 0\n')
  try {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'install.ps1'), '-MagpieBin', fake, '-InstallDir', target], { env: { ...process.env, QWENWORK_TEST_ARGS_LOG: log }, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr + result.stdout)
    const args = JSON.parse(fs.readFileSync(log, 'utf8').replace(/^\uFEFF/, ''))
    assert.deepEqual(args, ['plugin', 'add', target])
    assert.ok(fs.existsSync(path.join(target, 'lib/plugin.mjs')))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
