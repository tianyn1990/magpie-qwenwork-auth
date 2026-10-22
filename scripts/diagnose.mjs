import { discoverRuntime } from '../lib/runtime.mjs'
import { readFileSync } from 'node:fs'
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
try {
  const runtime = discoverRuntime()
  console.log(JSON.stringify({ plugin: pkg.name, version: pkg.version, signingAsset: runtime, credentialsRead: false, networkRequests: 0, configurationWrites: 0 }, null, 2))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
