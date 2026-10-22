const QUOTA = /quota[_ .-]*(?:exceed|exhaust)|insufficient[_ .-]*(?:quota|balance|credit)|credit[s]?[_ .-]*(?:exhaust|insufficient)|额度(?:已)?(?:用尽|耗尽|不足)|积分(?:已)?(?:耗尽|用完|不足)/i
const AUTH = /invalid[_ .-]*(?:grant|token)|(?:refresh[_ .-]*token).*(?:invalid|expired|revoked)|unauthorized|登录.*(?:失效|过期)/i

export class ProviderError extends Error {
  constructor(message, status = 502, code = 'upstream_error') {
    super(message)
    this.name = 'ProviderError'
    this.status = status
    this.code = code
  }
}

export function redact(value) {
  return String(value ?? '').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted JWT]')
    .replace(/\bory_rt_[A-Za-z0-9._~-]+/g, '[redacted refresh token]')
    .slice(0, 500)
}

function object(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return { message: value } }
  }
  return value
}

export function upstreamError(value, httpStatus = 200) {
  let current = object(value)
  let outerStatus = httpStatus
  for (let depth = 0; depth < 6 && current && typeof current === 'object'; depth++) {
    if (Array.isArray(current.choices)) return null
    if (Number(current.statusCodeValue) >= 400) outerStatus = Number(current.statusCodeValue)
    if (current.body !== undefined) { current = object(current.body); continue }
    if (current.error !== undefined) { current = object(current.error); continue }
    const code = current.code ?? current.errorCode ?? current.status_code
    const message = current.message ?? current.msg ?? current.errorMessage ?? current.error_message ?? ''
    const text = `${code ?? ''} ${message}`
    if (outerStatus === 429 || Number(code) === 429 || QUOTA.test(text)) return new ProviderError(redact(message || '千问办公积分已用尽或请求受限'), 429, 'insufficient_quota')
    if (outerStatus === 401 || Number(code) === 401 || AUTH.test(text)) return new ProviderError(redact(message || '千问办公插件登录已失效，请重新授权'), 401, 'authentication_error')
    if (outerStatus >= 400 || Number(code) >= 400 || (code !== undefined && !['ok', '0', '200', 'success', 'SUCCESS'].includes(String(code)))) {
      const status = [400, 403, 408, 409, 422, 425, 500, 502, 503, 504].includes(outerStatus) ? outerStatus : Number(code) >= 400 && Number(code) < 600 ? Number(code) : 502
      return new ProviderError(redact(message || code || '千问办公请求失败'), status)
    }
    if (outerStatus >= 400) return new ProviderError(redact(message || '千问办公请求失败'), outerStatus)
    return null
  }
  return outerStatus >= 400 ? new ProviderError('千问办公请求失败', outerStatus) : null
}

export function errorResponse(error) {
  const e = error instanceof ProviderError ? error : new ProviderError('千问办公连接失败；请检查网络或更新插件')
  const headers = { 'Content-Type': 'application/json' }
  if (e.status === 429) headers['Retry-After'] = '60'
  if (e.status === 401) headers['X-Magpie-Sign-In'] = 'expired'
  return Response.json({ error: { message: redact(e.message), type: e.code, code: e.code } }, { status: e.status, headers })
}

export function abortSignal(signal, timeout = 30000) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
}

export async function jsonResponse(response) {
  const text = await response.text()
  if (text.length > 2 * 1024 * 1024) throw new ProviderError('上游 JSON 响应超过限制')
  let value
  try { value = JSON.parse(text) } catch { throw new ProviderError(`千问办公返回了无法解析的响应（HTTP ${response.status}）`, response.status >= 400 ? response.status : 502) }
  const error = upstreamError(value, response.status)
  if (error) throw error
  for (let depth = 0; depth < 4 && value && typeof value === 'object' && value.data !== undefined; depth++) value = value.data
  return value
}
