export const PROVIDER_ID = 'qwenwork-community'
export const GATEWAY = 'https://gateway.qwenwork.cn'
export const CLIENT_ID = 'e883ade2-e6e3-4d6d-adf7-f92ceff5fdcb'
export const REDIRECT_URI = 'qwenwork-cn://'
export const ACCOUNT_PATH = '/api/v1/adapter/user/account-context?include=user,plan,quota,page,data_sharing'
export const REFRESH_PATH = '/api/v1/deviceToken/refresh'
export const FALLBACK_VERSION = '1.3.2'
export const FALLBACK_RELEASE = '1.3.2-26101704'
export const MODELS = Object.freeze({
  'qwork-auto': { name: '千问办公 · 基础', reasoning: true, tool_call: true, modalities: { input: ['text', 'image'], output: ['text'] }, limit: { context: 131072, output: 8192 } },
  'qwork-advanced': { name: '千问办公 · 高级', reasoning: true, tool_call: true, modalities: { input: ['text', 'image'], output: ['text'] }, limit: { context: 131072, output: 8192 } },
})

export function clientHeaders(runtime = {}) {
  const version = runtime.version || FALLBACK_VERSION
  const release = runtime.releaseVersion || FALLBACK_RELEASE
  return {
    Accept: 'application/json',
    'User-Agent': `QwenWork/${version}`,
    'X-QwenWork-Version': version,
    'X-QwenWork-Release-Version': release,
    'X-QwenWork-Build': release.split('-').at(-1),
    'X-QwenWork-Platform': process.platform,
    'X-QwenWork-Arch': process.arch,
    'X-QwenWork-Channel': 'stable',
    'X-QwenWork-App-Mode': 'standard',
  }
}
