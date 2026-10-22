import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { ACCOUNT_PATH, CLIENT_ID, REDIRECT_URI, GATEWAY, REFRESH_PATH, clientHeaders } from './constants.mjs'
import { abortSignal, jsonResponse, ProviderError } from './errors.mjs'

const isoTime = value => typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) || 0 : 0
function expiry(data, prefix = '', now = Date.now()) {
  const absolute = isoTime(data[`${prefix}expires_at`])
  const relative = data[`${prefix}expires_in`]
  return absolute || (Number.isFinite(relative) && relative > 0 ? now + relative * 1000 : 0)
}

export function startLogin(runtime) {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const nonce = randomUUID()
  const machineId = randomUUID()
  const query = new URLSearchParams({ challenge, challenge_method: 'S256', nonce, machine_id: machineId, client_id: CLIENT_ID, redirect_uri: REDIRECT_URI })
  return { verifier, challenge, nonce, machineId, runtime, url: `${GATEWAY}/device/selectAccounts?${query}` }
}

export async function pollLogin(flow, { fetchImpl = fetch, signal } = {}) {
  const query = new URLSearchParams({ nonce: flow.nonce, verifier: flow.verifier, challenge_method: 'S256' })
  const response = await fetchImpl(`${GATEWAY}/api/v1/deviceToken/poll?${query}`, { method: 'GET', headers: clientHeaders(flow.runtime), signal: abortSignal(signal), redirect: 'error' })
  if (response.status === 404) return null
  const data = await jsonResponse(response)
  if (!data?.token) return null
  if (typeof data.token !== 'string' || (data.nonce !== undefined && data.nonce !== flow.nonce) || (data.code_challenge !== undefined && data.code_challenge !== flow.challenge)) throw new ProviderError('授权响应与本次登录不匹配，请重新授权', 401, 'authentication_error')
  return data
}

const delay = (ms, signal) => new Promise((resolve, reject) => {
  signal?.throwIfAborted()
  const cleanup = () => signal?.removeEventListener('abort', stop)
  const timer = setTimeout(() => { cleanup(); resolve() }, ms)
  const stop = () => { clearTimeout(timer); cleanup(); reject(signal.reason) }
  signal?.addEventListener('abort', stop, { once: true })
})

export async function waitForLogin(flow, { fetchImpl = fetch, sleep = delay, timeout = 300000, interval = 1500, now = Date.now, signal } = {}) {
  const deadline = now() + timeout
  while (now() < deadline) {
    signal?.throwIfAborted()
    const tokens = await pollLogin(flow, { fetchImpl, signal })
    if (tokens) return tokens
    await sleep(interval, signal)
  }
  throw new ProviderError('浏览器授权超时，请重新点击登录生成新链接', 408, 'authentication_error')
}

export async function getAccount(auth, runtime, { fetchImpl = fetch, signal } = {}) {
  if (!auth?.access) throw new ProviderError('请先登录千问办公插件', 401, 'authentication_error')
  const response = await fetchImpl(GATEWAY + ACCOUNT_PATH, { headers: { ...clientHeaders(runtime), Authorization: `Bearer ${auth.access}` }, signal: abortSignal(signal), redirect: 'error' })
  const data = await jsonResponse(response)
  if (!data || typeof data !== 'object') throw new ProviderError('千问办公返回了无效账号信息')
  return data
}

export function authFromTokens(tokens, previous = {}, now = Date.now()) {
  const access = tokens.device_token ?? tokens.token ?? tokens.access_token
  if (typeof access !== 'string' || !access || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) throw new ProviderError('授权响应缺少访问令牌或刷新令牌', 401, 'authentication_error')
  const accessExpires = expiry(tokens, '', now)
  const refreshExpires = expiry(tokens, 'refresh_token_', now)
  const dates = [accessExpires, refreshExpires].filter(value => value > 0)
  return { ...previous, type: 'oauth', access, refresh: tokens.refresh_token, expires: dates.length ? Math.min(...dates) : 0, accessExpires, refreshExpires }
}

export async function finishLogin(flow, tokens, options = {}) {
  const auth = authFromTokens(tokens, { machineId: flow.machineId })
  const context = await getAccount(auth, flow.runtime, options)
  const user = context.user ?? {}
  const uid = String(user.id ?? user.uid ?? tokens.user_id ?? '')
  if (!uid) throw new ProviderError('千问办公未返回账号标识，未保存本次授权', 502)
  const email = typeof user.email === 'string' ? user.email : ''
  return { ...auth, uid, accountId: email || uid, email, name: String(user.name ?? user.username ?? tokens.user_name ?? ''), organizationId: String(user.organization_id ?? user.orgId ?? ''), plan: context.plan?.name ?? '' }
}

export async function renewAuth(auth, runtime, { fetchImpl = fetch, signal } = {}) {
  if (!auth?.refresh) throw Object.assign(new ProviderError('插件缺少刷新令牌，请重新授权', 401, 'authentication_error'), { signIn: 'expired' })
  try {
    const response = await fetchImpl(GATEWAY + REFRESH_PATH, { method: 'POST', headers: { ...clientHeaders(runtime), 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: auth.refresh, target: 'c' }), signal: abortSignal(signal), redirect: 'error' })
    return authFromTokens(await jsonResponse(response), auth)
  } catch (error) {
    if (error.status === 401 || error.status === 403 || /invalid.?grant/i.test(error.message)) error.signIn = 'expired'
    throw error
  }
}

export function quotaForMagpie(context, auth) {
  const quota = context.quota
  if (!quota || typeof quota.remaining !== 'number' || !Number.isFinite(quota.remaining)) return { error: '千问办公未返回积分余额', signIn: 'kept' }
  const remaining = quota.remaining
  const exceeded = quota.exceeded === true || remaining <= 0
  const display = `剩余 ${remaining.toLocaleString('en-US', { maximumFractionDigits: 4 })} 积分`
  const total = quota.total
  const used = quota.used
  const known = Number.isFinite(total) && total > 0 && Number.isFinite(used)
  const windows = known ? [{ name: '办公积分', used: exceeded ? 100 : Math.max(0, used / total * 100), amount: used, limit: total, unit: 'credits', display }]
    : exceeded ? [{ name: '办公积分已用尽', used: 100, display }]
      : []
  return { plan: String(context.plan?.name ?? auth.plan ?? '千问办公'), user: auth.email || auth.name || auth.uid, balance: display, windows, signIn: 'kept' }
}
