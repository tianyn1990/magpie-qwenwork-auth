import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { startLogin, pollLogin, waitForLogin, authFromTokens, renewAuth, quotaForMagpie, finishLogin } from '../lib/account.mjs'

const runtime = { version: '1.3.2', releaseVersion: '1.3.2-test' }
test('browser login uses PKCE and separate login state without any request', () => {
  const a = startLogin(runtime), b = startLogin(runtime)
  assert.equal(createHash('sha256').update(a.verifier).digest('base64url'), a.challenge)
  assert.notEqual(a.machineId, b.machineId)
  assert.notEqual(a.nonce, b.nonce)
  assert.equal(new URL(a.url).origin, 'https://gateway.qwenwork.cn')
  assert.equal(a.url.includes(a.verifier), false)
})
test('404 is pending; nonce/challenge mismatches cannot become credentials', async () => {
  const flow = startLogin(runtime)
  assert.equal(await pollLogin(flow, { fetchImpl: async () => new Response('{}', { status: 404 }) }), null)
  for (const patch of [{ nonce: 'other' }, { code_challenge: 'other' }]) {
    await assert.rejects(pollLogin(flow, { fetchImpl: async () => Response.json({ token: 'fake', ...patch }) }), /不匹配/)
  }
})
test('login polling has a deadline and receives caller cancellation', async () => {
  let time = 0
  await assert.rejects(waitForLogin(startLogin(runtime), {
    fetchImpl: async () => new Response('{}', { status: 404 }), timeout: 3,
    now: () => time++, sleep: async () => {},
  }), /超时/)
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  await assert.rejects(waitForLogin(startLogin(runtime), { signal: controller.signal }), /cancelled/)
})
test('host renews before the earliest known access or refresh expiry', () => {
  const auth = authFromTokens({ token: 'a', refresh_token: 'r', expires_in: 86400, refresh_token_expires_in: 3600 }, {}, 1000)
  assert.equal(auth.accessExpires, 86401000)
  assert.equal(auth.refreshExpires, 3601000)
  assert.equal(auth.expires, 3601000)
  assert.throws(() => authFromTokens({ token: 'a' }), /刷新令牌/)
})
test('browser completion queries that account and retains this flow device', async () => {
  const flow = startLogin(runtime)
  const auth = await finishLogin(flow, { token: 'a', refresh_token: 'r', expires_in: 3600 }, {
    fetchImpl: async (url, init) => {
      assert.match(url, /gateway\.qwenwork\.cn\/api\/v1\/adapter\/user\/account-context/)
      assert.equal(init.headers.Authorization, 'Bearer a')
      return Response.json({ code: 'ok', data: { user: { id: 'test-user', email: 'user@example.invalid' }, plan: { name: '个人免费版' } } })
    },
  })
  assert.equal(auth.uid, 'test-user')
  assert.equal(auth.machineId, flow.machineId)
  assert.equal(auth.accountId, 'user@example.invalid')
})
test('refresh uses only the provided plugin token, no Authorization header', async () => {
  const auth = await renewAuth({ type: 'oauth', access: 'old-a', refresh: 'old-r', uid: 'u' }, runtime, {
    fetchImpl: async (url, init) => {
      assert.match(url, /\/deviceToken\/refresh$/)
      assert.equal(new Headers(init.headers).has('authorization'), false)
      assert.deepEqual(JSON.parse(init.body), { refresh_token: 'old-r', target: 'c' })
      return Response.json({ device_token: 'new-a', refresh_token: 'new-r', expires_in: 3600 })
    },
  })
  assert.equal(auth.access, 'new-a')
  assert.equal(auth.refresh, 'new-r')
  assert.equal(auth.uid, 'u')
})
test('transient refresh failure is distinct from a refused sign-in', async () => {
  for (const status of [401, 503]) {
    await assert.rejects(renewAuth({ refresh: 'r' }, runtime, { fetchImpl: async () => Response.json({ error: { message: 'refused' } }, { status }) }), error => status === 401 ? error.signIn === 'expired' : !error.signIn)
  }
})
test('fractional remaining credit with unknown total never invents a percentage', () => {
  const result = quotaForMagpie({ quota: { remaining: 2099.7217, total: null, used: null } }, { uid: 'u' })
  assert.match(result.balance, /2,099\.7217/)
  assert.deepEqual(result.windows, [])
  assert.equal(quotaForMagpie({ quota: { remaining: 0, exceeded: true } }, {}).windows[0].used, 100)
  assert.match(quotaForMagpie({}, {}).error, /未返回/)
})
