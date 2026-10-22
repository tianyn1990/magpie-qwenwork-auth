import { randomUUID } from 'node:crypto'
import { GATEWAY, MODELS, clientHeaders } from './constants.mjs'
import { ProviderError, upstreamError, abortSignal, errorResponse } from './errors.mjs'

export function buildRequest(request) {
  if (!Object.hasOwn(MODELS, request.model)) throw new ProviderError('请选择插件列出的千问办公模型档位', 400, 'invalid_request_error')
  if (!Array.isArray(request.messages) || !request.messages.length) throw new ProviderError('messages 必须是非空数组', 400, 'invalid_request_error')
  const ids = new Set()
  const messages = request.messages.map(message => {
    if (!message || !['system', 'developer', 'user', 'assistant', 'tool'].includes(message.role)) throw new ProviderError('不支持的消息类型', 400, 'invalid_request_error')
    const copy = { ...message, role: message.role === 'developer' ? 'system' : message.role }
    if (copy.role === 'assistant' && copy.tool_calls) {
      if (!Array.isArray(copy.tool_calls)) throw new ProviderError('tool_calls 必须是数组', 400)
      for (const call of copy.tool_calls) {
        if (!call.id || !call.function?.name) throw new ProviderError('工具调用缺少 id 或名称', 400)
        ids.add(call.id)
      }
    }
    if (copy.role === 'tool' && (!copy.tool_call_id || !ids.has(copy.tool_call_id))) throw new ProviderError('工具结果缺少匹配的 tool_call_id', 400, 'invalid_request_error')
    return copy
  })
  const tools = request.tools ?? []
  if (!Array.isArray(tools) || tools.some(tool => tool.type !== 'function' || typeof tool.function?.name !== 'string' || !tool.function.name)) throw new ProviderError('插件仅接收 OpenAI function 格式的工具定义', 400, 'invalid_request_error')
  const maxTokens = request.max_completion_tokens ?? request.max_tokens ?? 8192
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 32000) throw new ProviderError('max_tokens 必须在 1 到 32000 之间', 400)
  const parameters = { max_tokens: maxTokens }
  for (const key of ['temperature', 'top_p', 'stop', 'seed', 'response_format', 'tool_choice', 'parallel_tool_calls']) if (request[key] !== undefined) parameters[key] = request[key]
  const lastUser = messages.findLast(message => message.role === 'user')
  const text = typeof lastUser?.content === 'string' ? lastUser.content : Array.isArray(lastUser?.content) ? lastUser.content.filter(part => part.type === 'text').map(part => part.text).join('\n') : ''
  const system = messages.filter(message => message.role === 'system' && typeof message.content === 'string').map(message => message.content).join('\n\n')
  const model = request.model
  const reasoning = request.reasoning_effort !== undefined && !['none', 'off'].includes(request.reasoning_effort)
  const requestId = randomUUID()
  return {
    request_id: requestId, request_set_id: requestId, chat_record_id: requestId,
    session_id: randomUUID(), stream: true, chat_task: 'FREE_INPUT',
    chat_context: { text, features: [], extra: { context: [], modelConfig: { key: model, is_reasoning: reasoning }, originalContent: text }, chatPrompt: '', imageUrls: null },
    is_reply: true, is_retry: false, source: 1, version: '3', agent_id: 'agent_common', task_id: 'common',
    session_type: 'qoder_work', aliyun_user_type: '',
    model_config: { key: model, display_name: model, model: '', format: 'openai', is_vl: true, is_reasoning: reasoning, api_key: '', url: '', source: 'system', max_input_tokens: 131072 },
    system, messages, tools, parameters,
    ...(request.tool_choice !== undefined ? { tool_choice: request.tool_choice } : {}),
    ...(request.parallel_tool_calls !== undefined ? { parallel_tool_calls: request.parallel_tool_calls } : {}),
    business: { product: 'qoder_work', type: 'agent', version: '1', feature_switches: {} },
  }
}

const STREAM_DONE = Symbol('stream done')

function decodeFrame(raw) {
  if (raw === '[DONE]') return STREAM_DONE
  let value
  try { value = JSON.parse(raw) } catch { throw new ProviderError('千问办公返回了无效的流式 JSON') }
  const error = upstreamError(value)
  if (error) throw error
  for (let depth = 0; depth < 6 && value && typeof value === 'object' && value.body !== undefined; depth++) {
    value = value.body
    if (typeof value === 'string') {
      if (!value.trim()) return null
      if (value.trim() === '[DONE]') return STREAM_DONE
      try { value = JSON.parse(value) } catch { throw new ProviderError('千问办公返回了无效的响应信封') }
    }
  }
  if (value === null || typeof value !== 'object' || Object.keys(value).length === 0) return null
  if (!Array.isArray(value.choices) && !value.usage) throw new ProviderError('千问办公响应缺少 choices 或 usage')
  return value
}

async function* frames(response, signal) {
  if (!response.body) throw new ProviderError('千问办公返回了空响应')
  const reader = response.body.getReader()
  const stop = () => { reader.cancel(signal.reason).catch(() => {}) }
  signal?.addEventListener('abort', stop, { once: true })
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      signal?.throwIfAborted()
      const { value, done } = await reader.read()
      signal?.throwIfAborted()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      if (buffer.length > 8 * 1024 * 1024) throw new ProviderError('千问办公单个流事件超过限制')
      let match
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n').trim()
        if (data) yield data
      }
      if (done) {
        const data = buffer.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim()
        if (data) yield data
        break
      }
    }
  } finally {
    signal?.removeEventListener('abort', stop)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

async function* chunks(response, model, signal) {
  let finished = false
  let meaningful = false
  for await (const raw of frames(response, signal)) {
    const chunk = decodeFrame(raw)
    if (chunk === STREAM_DONE) {
      if (!finished) throw new ProviderError('千问办公提前结束响应，未返回完成标记')
      // The gateway wraps [DONE] too, then appends transport timing data.
      // Stop here so those statistics cannot invalidate a completed reply.
      return
    }
    if (!chunk) continue
    meaningful = true
    chunk.model = model
    for (const choice of chunk.choices ?? []) if (choice.finish_reason != null) finished = true
    yield chunk
  }
  if (!meaningful || !finished) throw new ProviderError('千问办公连接中断，响应未完成')
}

async function collect(iterator, first, model) {
  const result = { id: first.id || `chatcmpl-${randomUUID()}`, object: 'chat.completion', created: first.created || Math.floor(Date.now() / 1000), model, choices: [] }
  const choices = new Map()
  const add = chunk => {
    if (chunk.usage) result.usage = chunk.usage
    for (const part of chunk.choices ?? []) {
      const index = part.index ?? 0
      if (!choices.has(index)) choices.set(index, { index, message: { role: 'assistant', content: '' }, finish_reason: null })
      const choice = choices.get(index)
      const delta = part.delta ?? part.message ?? {}
      for (const key of ['content', 'reasoning_content', 'reasoning_text', 'refusal']) if (typeof delta[key] === 'string') choice.message[key] = (choice.message[key] ?? '') + delta[key]
      for (const call of delta.tool_calls ?? []) {
        choice.message.tool_calls ??= []
        const index = call.index ?? 0
        choice.message.tool_calls[index] ??= { id: '', type: 'function', function: { name: '', arguments: '' } }
        const target = choice.message.tool_calls[index]
        if (call.id) target.id = call.id
        if (call.function?.name) target.function.name += call.function.name
        if (call.function?.arguments) target.function.arguments += call.function.arguments
      }
      if (part.finish_reason != null) choice.finish_reason = part.finish_reason
    }
  }
  add(first)
  for await (const chunk of iterator) add(chunk)
  result.choices = [...choices.values()].sort((a, b) => a.index - b.index)
  for (const choice of result.choices) if (choice.message.tool_calls) choice.message.tool_calls = choice.message.tool_calls.filter(Boolean)
  return Response.json(result)
}

export async function chatResponse(request, auth, runtime, { signer, fetchImpl = fetch, signal } = {}) {
  const body = buildRequest(request)
  if (!auth?.access || !auth.uid || !auth.machineId) throw new ProviderError('插件授权信息不完整，请重新登录', 401, 'authentication_error')
  const prepared = await signer({ wasmPath: runtime.wasmPath, cosyVersion: runtime.version, uid: auth.uid, name: auth.name ?? '', email: auth.email ?? '', accessToken: auth.access, machineId: auth.machineId, organizationId: auth.organizationId ?? '', dataPolicyAgreed: false, body: JSON.stringify(body), modelKey: request.model, endpoint: GATEWAY })
  const target = new URL(prepared.url, GATEWAY)
  if (target.origin !== GATEWAY || target.pathname !== '/algo/api/v2/service/pro/sse/agent_chat_generation') throw new ProviderError('签名组件返回了非预期的推理地址，已拒绝发送', 502)
  const headers = { ...clientHeaders(runtime), Accept: 'text/event-stream', 'Content-Type': 'application/json', 'X-Request-Id': randomUUID(), 'X-Model-Key': request.model, 'X-Model-Source': 'system', 'Cosy-MachineId': auth.machineId, 'Cosy-MachineToken': auth.machineId, 'Cosy-Version': runtime.version, 'Cosy-ClientType': '6', 'Cosy-Business-Product': 'qoder_work', 'Cosy-Business-Type': 'agent', 'Cosy-Scene': 'qwork', 'Cosy-MachineOS': `${process.arch}_${process.platform}`, 'Cosy-MachineType': '5', 'Cosy-Data-Policy': 'disagree', 'Login-Version': 'v2', ...prepared.headers }
  const cancellation = new AbortController()
  const requestSignal = abortSignal(signal ? AbortSignal.any([signal, cancellation.signal]) : cancellation.signal, 10 * 60 * 1000)
  let upstream = await fetchImpl(target.href, { method: 'POST', headers, body: prepared.body, signal: requestSignal, redirect: 'error' })
  if (!upstream.ok) {
    const text = await upstream.text()
    const error = upstreamError(text.slice(0, 10000), upstream.status)
    throw error ?? new ProviderError(`千问办公返回 HTTP ${upstream.status}`, upstream.status)
  }
  if ((upstream.headers.get('content-type') ?? '').includes('application/json')) {
    const value = await upstream.json().catch(() => { throw new ProviderError('千问办公返回了无效 JSON') })
    const error = upstreamError(value)
    if (error) throw error
    let completion = value
    for (let depth = 0; depth < 4 && completion?.body !== undefined; depth++) completion = typeof completion.body === 'string' ? JSON.parse(completion.body) : completion.body
    if (!Array.isArray(completion?.choices)) throw new ProviderError('千问办公返回了无效的模型响应')
    const chunk = { ...completion, object: 'chat.completion.chunk', choices: completion.choices.map(choice => ({ ...choice, delta: choice.message ?? choice.delta, message: undefined })) }
    upstream = new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`)
  }
  const iterator = chunks(upstream, request.model, requestSignal)
  // Read before returning HTTP headers: an initial in-stream quota error must be 429.
  const prelude = []
  let meaningful = false
  while (!meaningful) {
    const next = await iterator.next()
    if (next.done) throw new ProviderError('千问办公没有返回模型内容')
    prelude.push(next.value)
    meaningful = (next.value.choices ?? []).some(choice => {
      const delta = choice.delta ?? choice.message ?? {}
      return choice.finish_reason != null || delta.content || delta.reasoning_content || delta.reasoning_text || delta.refusal || delta.tool_calls?.length
    })
    if (prelude.length > 32) { await iterator.return(); throw new ProviderError('千问办公返回了过多无内容事件') }
  }
  const all = (async function* () { yield* prelude; yield* iterator })()
  const first = await all.next()
  if (!request.stream) return collect(all, first.value, request.model)
  const encoder = new TextEncoder()
  let pending = first.value
  return new Response(new ReadableStream({
    async pull(controller) {
      try {
        const next = pending ? { value: pending, done: false } : await all.next()
        pending = null
        if (next.done) { controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close() }
        else controller.enqueue(encoder.encode(`data: ${JSON.stringify(next.value)}\n\n`))
      } catch (error) {
        if (requestSignal.aborted) { controller.error(requestSignal.reason); return }
        const payload = await errorResponse(error).text()
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`))
        controller.close()
      }
    },
    async cancel(reason) { cancellation.abort(reason ?? new Error('Client cancelled')); await all.return() },
  }), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
}
