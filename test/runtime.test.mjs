import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { discoverRuntime, runtimeCandidates } from '../lib/runtime.mjs'
import { prepareQwenworkInfer } from '../lib/wasm.mjs'
import { upstreamError, redact } from '../lib/errors.mjs'

test('runtime discovery considers explicit paths, macOS and Windows installations', () => {
  assert.equal(runtimeCandidates({ env: { QWENWORK_WASM_PATH: '/custom/file.wasm' }, platform: 'linux', home: '/empty' })[0], '/custom/file.wasm')
  assert.ok(runtimeCandidates({ env: {}, platform: 'darwin', home: '/test' }).includes('/Applications/QwenWorkCN.app/Contents/Resources/qoder-auth-wasm/qoder_auth_wasm_bg.wasm'))
  assert.ok(runtimeCandidates({ env: { LOCALAPPDATA: 'C:/Users/test/AppData/Local' }, platform: 'win32', home: 'C:/Users/test' }).some(file => file.includes('QwenWorkCN')))
})
test('missing runtime is actionable and never reads a credential store', () => {
  assert.throws(() => discoverRuntime({ env: {}, platform: 'unsupported', home: '/unused' }), /不读取 App 的登录文件/)
})
test('unknown signing ABI is rejected before a request can be sent', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qw-abi-'))
  const file = path.join(root, 'empty.wasm')
  fs.writeFileSync(file, Buffer.from('0061736d01000000', 'hex'))
  try {
    await assert.rejects(prepareQwenworkInfer({ wasmPath: file }), /必要导出/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
test('error normalization handles auth, nested quota and redacts bearer values', () => {
  assert.equal(upstreamError({ statusCodeValue: 200, body: { code: 'INSUFFICIENT_CREDITS', message: '积分不足' } }).status, 429)
  assert.equal(upstreamError({ error: { message: 'unauthorized' } }).status, 401)
  assert.equal(upstreamError({ choices: [{ delta: { content: 'unauthorized' } }] }), null)
  assert.doesNotMatch(redact('Bearer sensitive-value'), /sensitive-value/)
})
let runtime
try { runtime = discoverRuntime() } catch {}
test('installed official app signs a fake request offline without copying its WASM', { skip: !runtime && 'No official QwenWork signing asset on this runner' }, async () => {
  const plaintext = JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'offline-only' }] })
  const prepared = await prepareQwenworkInfer({ ...runtime, cosyVersion: runtime.version, uid: 'offline', name: 'Offline', email: 'offline@example.invalid', accessToken: 'fake-access', machineId: 'offline-device', body: plaintext, modelKey: 'qwork-advanced', endpoint: 'https://gateway.qwenwork.cn' })
  assert.equal(new URL(prepared.url).origin, 'https://gateway.qwenwork.cn')
  assert.equal(new URL(prepared.url).searchParams.get('Encode'), '1')
  assert.match(prepared.headers.Authorization ?? prepared.headers.authorization, /^Bearer COSY\./)
  assert.notEqual(prepared.body, plaintext)
  assert.equal(prepared.body.includes('offline-only'), false)
})
