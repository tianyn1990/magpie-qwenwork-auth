import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { deflateRawSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
const root = fileURLToPath(new URL('../', import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')))
const dist = path.join(root, 'dist')
fs.mkdirSync(dist, { recursive: true })
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const packed = JSON.parse(execFileSync(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', dist], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' }))[0]
const entries = packed.files.map(entry => entry.path).sort()
for (const entry of entries) {
  assert.ok(!entry.split('/').includes('..') && !path.isAbsolute(entry))
  assert.doesNotMatch(entry, /\.wasm$|(?:^|\/)(?:\.git|\.env[^/]*|node_modules|dist|plugin-auth\.json)(?:\/|$)/)
}
const crc = data => { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)) } return (crc ^ 0xffffffff) >>> 0 }
const pieces = [], central = []
let offset = 0
for (const entry of entries) {
  const name = Buffer.from(`${pkg.name}-${pkg.version}/${entry}`, 'utf8')
  const source = fs.readFileSync(path.join(root, entry))
  const data = deflateRawSync(source, { level: 9 })
  const checksum = crc(source)
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8); header.writeUInt16LE(33, 12)
  header.writeUInt32LE(checksum, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(source.length, 22); header.writeUInt16LE(name.length, 26)
  pieces.push(header, name, data)
  const directory = Buffer.alloc(46)
  directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(0x314, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(8, 10); directory.writeUInt16LE(33, 14)
  directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(source.length, 24); directory.writeUInt16LE(name.length, 28)
  directory.writeUInt32LE(((0o100000 | (entry.endsWith('.command') || entry.endsWith('.sh') ? 0o755 : 0o644)) << 16) >>> 0, 38)
  directory.writeUInt32LE(offset, 42)
  central.push(directory, name)
  offset += header.length + name.length + data.length
}
const directory = Buffer.concat(central)
const tail = Buffer.alloc(22)
tail.writeUInt32LE(0x06054b50); tail.writeUInt16LE(entries.length, 8); tail.writeUInt16LE(entries.length, 10); tail.writeUInt32LE(directory.length, 12); tail.writeUInt32LE(offset, 16)
const zip = `${pkg.name}-${pkg.version}.zip`
fs.writeFileSync(path.join(dist, zip), Buffer.concat([...pieces, directory, tail]))
const manifest = { name: pkg.name, version: pkg.version, provider: 'qwenwork-community', prerelease: pkg.version.includes('-'), artifacts: [zip, packed.filename], dependencies: { magpie: '0.1.1296+ (plugin interface inspected)', qwenworkDesktop: '1.3.2 signing asset and existing authorized account tested; user must install the official app', npmRuntimeDependencies: 0 }, validation: { mockProtocolTests: true, installedAppOfflineSigning: 'macOS QwenWorkCN 1.3.2', liveAccountAuthorization: false, liveInference: true, liveToolRoundtrip: true, liveInferenceScope: '2026-10-22: existing plugin authorization, qwork-auto text, qwork-advanced streamed diagnostic tool and result; no fresh sign-in or refresh', liveCreditDebit: false }, vendorWasmIncluded: false, credentialsIncluded: false }
fs.writeFileSync(path.join(dist, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
const artifacts = [zip, packed.filename, 'release-manifest.json']
fs.writeFileSync(path.join(dist, 'SHA256SUMS'), artifacts.map(file => `${createHash('sha256').update(fs.readFileSync(path.join(dist, file))).digest('hex')}  ${file}`).join('\n') + '\n')
console.log(JSON.stringify({ version: pkg.version, files: entries.length, artifacts: [...artifacts, 'SHA256SUMS'] }, null, 2))
