import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRequest } from '../lib/chat.mjs'
import { createHooks } from '../lib/plugin.mjs'

const auth = { type: 'oauth', access: 'fake', refresh: 'fake-r', uid: 'test', machineId: 'test-device', expires: Date.now() + 86400000 }
const runtime = { version: '1.3.2', releaseVersion: '1.3.2-test', wasmPath: 'unused' }
const encode = value => `data: ${JSON.stringify({ statusCodeValue: 200, body: JSON.stringify(value) })}\r\n\r\n`
const part = (delta, finish_reason = null) => ({ id: 'test', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })
function fixture(text, options = {}) {
  let called = 0
  const hooks = createHooks({}, { runtimeProvider: () => runtime, signer: async options => {
    called++
    return { url: 'https://gateway.qwenwork.cn/algo/api/v2/service/pro/sse/agent_chat_generation?Encode=1', headers: { Authorization: 'Bearer COSY.fake' }, body: options.body }
  }, fetchImpl: async (url, init) => {
    assert.equal(new URL(url).hostname, 'gateway.qwenwork.cn')
    options.inspect?.(JSON.parse(init.body), init)
    return new Response(text, { headers: { 'Content-Type': 'text/event-stream' } })
  } })
  return { hooks, called: () => called }
}
async function request(hooks, body, signal) {
  const loader = await hooks.auth.loader(async () => auth)
  return loader.fetch('https://gateway.qwenwork.cn/v1/chat/completions', { method: 'POST', body: JSON.stringify({ model: 'qwork-advanced', messages: [{ role: 'user', content: 'hello' }], ...body }), signal })
}
test('preserves OpenAI tool schemas, tool results, developer instruction and image input', () => {
  const tools = [{ type: 'function', function: { name: 'read_file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }]
  const messages = [
    { role: 'developer', content: 'instruction' },
    { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
    { role: 'assistant', content: null, tool_calls: [{ id: 'call1', type: 'function', function: { name: 'read_file', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'call1', content: 'file content' },
  ]
  const body = buildRequest({ model: 'qwork-auto', messages, tools, tool_choice: 'auto' })
  assert.deepEqual(body.tools, tools)
  assert.equal(body.messages[0].role, 'system')
  assert.equal(body.messages[1].content[0].image_url.url, messages[1].content[0].image_url.url)
  assert.equal(body.messages[3].tool_call_id, 'call1')
  assert.equal(body.parameters.tool_choice, 'auto')
  assert.equal(buildRequest({ model: 'qwork-auto', messages: [{ role: 'user', content: 'hi' }] }).model_config.is_reasoning, false)
})
test('rejects unmatched tools and unsupported model without an upstream call', () => {
  assert.throws(() => buildRequest({ model: 'gpt-fake', messages: [] }), /模型档位/)
  assert.throws(() => buildRequest({ model: 'qwork-auto', messages: [{ role: 'tool', tool_call_id: 'unknown' }] }), /tool_call_id/)
})
test('initial quota error inside HTTP 200 becomes HTTP 429 for Magpie fallback', async () => {
  const { hooks } = fixture(encode({ code: 429, message: 'quota exhausted' }))
  const response = await request(hooks, { stream: true })
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '60')
  assert.equal((await response.json()).error.code, 'insufficient_quota')
})
test('a role-only prelude cannot hide the initial quota error', async () => {
  const { hooks } = fixture(encode(part({ role: 'assistant', content: '' })) + encode({ code: 429, message: '积分不足' }))
  assert.equal((await request(hooks, { stream: true })).status, 429)
})
test('HTTP 200 JSON quota errors also become 429', async () => {
  const hooks = createHooks({}, { runtimeProvider: () => runtime, signer: async () => ({ url: 'https://gateway.qwenwork.cn/algo/api/v2/service/pro/sse/agent_chat_generation', headers: {}, body: 'fake' }), fetchImpl: async () => Response.json({ code: 'INSUFFICIENT_CREDITS', message: '积分不足' }) })
  assert.equal((await request(hooks, { stream: true })).status, 429)
})
test('normal text mentioning quota is never mistaken for an error', async () => {
  const { hooks } = fixture(encode(part({ content: 'quota exhausted is an example phrase' })) + encode(part({}, 'stop')) + 'data: [DONE]\n\n')
  const response = await request(hooks, { stream: false })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).choices[0].message.content, 'quota exhausted is an example phrase')
})
test('non-streaming joins fragmented tool calls and includes upstream usage', async () => {
  const content = encode(part({ tool_calls: [{ index: 0, id: 'c1', type: 'function', function: { name: 'read_file', arguments: '{"pa' } }] }))
    + encode(part({ tool_calls: [{ index: 0, function: { arguments: 'th":"a"}' } }] }))
    + encode(part({}, 'tool_calls')) + encode({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 8 } }) + 'data: [DONE]\n\n'
  const { hooks } = fixture(content)
  const body = await (await request(hooks, { stream: false })).json()
  assert.equal(body.choices[0].message.tool_calls[0].id, 'c1')
  assert.deepEqual(JSON.parse(body.choices[0].message.tool_calls[0].function.arguments), { path: 'a' })
  assert.equal(body.usage.prompt_tokens, 10)
})
test('streaming preserves chunks, reasoning and final usage', async () => {
  const content = encode(part({ reasoning_content: 'think' })) + encode(part({ content: '你好' })) + encode(part({}, 'stop')) + encode({ choices: [], usage: { total_tokens: 9 } }) + 'data: [DONE]\n\n'
  const { hooks } = fixture(content)
  const response = await request(hooks, { stream: true })
  const text = await response.text()
  assert.match(text, /你好/)
  assert.match(text, /reasoning_content/)
  assert.match(text, /total_tokens/)
  assert.equal(text.match(/\[DONE\]/g)?.length, 1)
})
test('UTF-8 and CRLF split across individual upstream bytes survive decoding', async () => {
  const bytes = new TextEncoder().encode(encode(part({ content: '中文🙂' })) + encode(part({}, 'stop')) + 'data: [DONE]\n\n')
  const hooks = createHooks({}, { runtimeProvider: () => runtime, signer: async () => ({ url: 'https://gateway.qwenwork.cn/algo/api/v2/service/pro/sse/agent_chat_generation', headers: {}, body: 'fake' }), fetchImpl: async () => new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close() } })) })
  const body = await (await request(hooks, { stream: false })).json()
  assert.equal(body.choices[0].message.content, '中文🙂')
})
test('cancelling the consumer cancels an unfinished upstream reader', { timeout: 2000 }, async () => {
  let cancelled = false
  const hooks = createHooks({}, { runtimeProvider: () => runtime, signer: async () => ({ url: 'https://gateway.qwenwork.cn/algo/api/v2/service/pro/sse/agent_chat_generation', headers: {}, body: 'fake' }), fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(encode(part({ content: 'started' })))) },
    cancel() { cancelled = true },
  })) })
  const response = await request(hooks, { stream: true })
  await response.body.cancel()
  assert.equal(cancelled, true)
})
test('truncated reply cannot be reported as a successful completion', async () => {
  const { hooks } = fixture(encode(part({ content: 'unfinished' })))
  const response = await request(hooks, { stream: false })
  assert.equal(response.status, 502)
  const stream = await request(hooks, { stream: true })
  const text = await stream.text()
  assert.match(text, /error/)
  assert.doesNotMatch(text, /\[DONE\]/)
})
test('loader rejects other destinations and serves the local model catalog without network', async () => {
  const { hooks, called } = fixture('')
  const loader = await hooks.auth.loader(async () => auth)
  assert.equal((await loader.fetch('https://untrusted.invalid/v1/chat/completions')).status, 400)
  const models = await (await loader.fetch('https://gateway.qwenwork.cn/v1/models', { method: 'GET' })).json()
  assert.equal(models.data.length, 2)
  assert.equal(called(), 0)
})
test('configuration leaves existing providers intact and exports only one plugin entry', async () => {
  const { hooks } = fixture('')
  const config = { provider: { codex: { test: true } } }
  await hooks.config(config)
  assert.deepEqual(config.provider.codex, { test: true })
  assert.ok(config.provider['qwenwork-community'])
  const entry = await import('../index.mjs')
  assert.deepEqual(Object.keys(entry), ['QwenWorkPlugin'])
})
