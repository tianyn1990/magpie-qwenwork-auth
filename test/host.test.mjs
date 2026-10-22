import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import readline from 'node:readline'

test('isolated Magpie host discovers provider, loader and local model catalog', { skip: !process.env.MAGPIE_TEST_HOST && 'Set MAGPIE_TEST_HOST for an isolated host check', timeout: 20000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qw-host-'))
  const root = fileURLToPath(new URL('../', import.meta.url))
  const authPath = path.join(directory, 'fake-auth.json')
  fs.writeFileSync(authPath, JSON.stringify({ 'qwenwork-community': { type: 'oauth', access: 'offline-fake', refresh: 'offline-fake-refresh', expires: Date.now() + 86400000, uid: 'offline', machineId: 'offline-device', accountId: 'offline@example.invalid' } }), { mode: 0o600 })
  const child = spawn(process.env.MAGPIE_TEST_BUN || 'bun', [process.env.MAGPIE_TEST_HOST], { cwd: directory, stdio: ['pipe', 'pipe', 'pipe'] })
  const pending = new Map()
  let next = 0, stderr = ''
  child.stderr.on('data', data => { stderr += data.toString() })
  const lines = readline.createInterface({ input: child.stdout })
  lines.on('line', line => {
    const msg = JSON.parse(line), job = pending.get(msg.id)
    if (!job) return
    if (msg.event) { job.events.push(msg); return }
    clearTimeout(job.timer)
    pending.delete(msg.id)
    if (msg.error) job.reject(new Error(msg.error.message))
    else job.resolve({ result: msg.result, events: job.events })
  })
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++next
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Host timeout: ${method}; ${stderr.slice(0, 300)}`)) }, 8000)
    pending.set(id, { resolve, reject, events: [], timer })
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
  })
  try {
    const init = await call('init', { authPath, directory, plugins: [{ spec: root, target: root }], config: {} })
    assert.equal(init.result.plugins.length, 1)
    assert.equal(init.result.plugins[0].error, undefined)
    const { result: providers } = await call('providers', {})
    const provider = providers.find(item => item.id === 'qwenwork-community')
    assert.ok(provider)
    assert.equal(provider.signedIn, true)
    assert.equal(provider.usage, true)
    assert.equal(provider.maxConcurrency, 2)
    assert.match(provider.icon, /^data:image\/svg\+xml;base64,/)
    const { result: loaded } = await call('load', { provider: provider.id })
    assert.equal(loaded.fetch, true)
    const fetched = await call('fetch', { provider: provider.id, model: 'qwork-auto', npm: '@ai-sdk/openai-compatible', url: 'https://gateway.qwenwork.cn/v1/models', method: 'GET', window: 65536 })
    assert.equal(fetched.events.find(event => event.event === 'head').status, 200)
    const body = fetched.events.filter(event => event.event === 'chunk').map(event => Buffer.from(event.data, 'base64').toString()).join('')
    assert.equal(JSON.parse(body).data.length, 2)
    const stored = JSON.parse(fs.readFileSync(authPath))
    assert.equal(stored['qwenwork-community'].access, 'offline-fake')
  } finally {
    for (const job of pending.values()) clearTimeout(job.timer)
    child.stdin.end()
    child.kill()
    lines.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
