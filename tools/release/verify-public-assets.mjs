import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version
const provider = process.argv[2]
if (!['qiniu', 'github'].includes(provider)) throw new Error('Usage: node tools/release/verify-public-assets.mjs qiniu|github')
const installer = `zerowall-science-${version}-win-x64.exe`
const versionMetadata = `zerowall-science-${version}-latest.json`
const files = [installer, `${installer}.blockmap`, versionMetadata, 'latest.yml', 'releases-latest.json', 'releases-zerowallsciencedev-latest.json']
const metadata = JSON.parse(await readFile(resolve(root, 'desktop/dist', versionMetadata), 'utf8'))
const base = new URL(metadata.assetUrl).origin
const report = []
for (const name of files) {
  const local = resolve(root, 'desktop/dist', name)
  const localHash = createHash('sha256')
  for await (const chunk of createReadStream(local)) localHash.update(chunk)
  const expected = { bytes: (await stat(local)).size, sha256: localHash.digest('hex') }
  const key = name === 'latest.yml' ? 'stable/latest.yml'
    : name === 'releases-latest.json' ? 'stable/releases/latest.json'
      : name === 'releases-zerowallsciencedev-latest.json' ? 'stable/releases-zerowallsciencedev/latest.json'
        : `stable/releases/${version}/${name}`
  const url = provider === 'qiniu' ? `${base}/${key}` : `https://github.com/ccfwwm/zerowallscience/releases/download/v${version}/${name}`
  const response = await fetch(url, { signal: AbortSignal.timeout(900_000), cache: 'no-store' })
  if (!response.ok || !response.body) throw new Error(`${name}: HTTP ${response.status}`)
  let bytes = 0
  const downloadedHash = createHash('sha256')
  for await (const chunk of response.body) { bytes += chunk.byteLength; downloadedHash.update(chunk) }
  const sha256 = downloadedHash.digest('hex')
  if (bytes !== expected.bytes || sha256 !== expected.sha256) throw new Error(`${name}: public bytes differ from the verified local artifact`)
  report.push({ name, url, bytes, sha256, verifiedAt: new Date().toISOString() })
  console.log(`${provider}: ${name} ${bytes} ${sha256} MATCH`)
}
const output = resolve(root, 'desktop/dist', `verification-${version}`)
await mkdir(output, { recursive: true })
await writeFile(resolve(output, `${provider}-public-assets.json`), JSON.stringify(report, null, 2) + '\n')
