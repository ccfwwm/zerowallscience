import { createHash, sign } from 'node:crypto'
import { createRequire } from 'node:module'
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'
const JSZip = createRequire(resolve(import.meta.dirname, '../../desktop/package.json'))('jszip')

const root = resolve(import.meta.dirname, '../..')
const staging = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_STAGING ?? join(root, 'mcp-environment-staging'))
const output = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_OUTPUT ?? join(root, 'desktop', 'dist', 'mcp-environment'))
const version = process.env.ZEROWALL_MCP_ENVIRONMENT_VERSION?.trim()
if (!version) throw new Error('ZEROWALL_MCP_ENVIRONMENT_VERSION is required.')
const privateKey = process.env.ZEROWALL_MCP_ENVIRONMENT_PRIVATE_KEY?.trim()
if (!privateKey) throw new Error('ZEROWALL_MCP_ENVIRONMENT_PRIVATE_KEY is required and must never be committed.')

async function filesUnder(path) {
  const entries = await readdir(path, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(child))
    else if (entry.isFile()) files.push(child)
  }
  return files
}

await stat(join(staging, 'bio-tools', 'python', 'python.exe'))
await stat(join(staging, 'bio-tools', 'run_server.py'))
await stat(join(staging, 'ketcher-chemistry', 'server.js'))
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
const zip = new JSZip()
for (const path of await filesUnder(staging)) zip.file(relative(staging, path).replaceAll('\\', '/'), await readFile(path))
const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
const archiveName = `zerowall-mcp-windows-x64-${version}.zip`
const archivePath = join(output, archiveName)
await writeFile(archivePath, archive)
const archiveSha256 = createHash('sha256').update(archive).digest('hex')
const sourceHashes = {}
for (const path of await filesUnder(staging)) sourceHashes[relative(staging, path).replaceAll('\\', '/')] = createHash('sha256').update(await readFile(path)).digest('hex')
const baseUrl = (process.env.ZEROWALL_MCP_ENVIRONMENT_BASE_URL ?? 'https://zerowall.chengxunkeji.cn/stable/mcp-environments/windows-x64').replace(/\/$/u, '')
const manifest = {
  schema: 1, environmentId: 'claude-science-mcp', version, platform: 'win32', architecture: 'x64',
  archiveUrl: `${baseUrl}/${version}/${archiveName}`, archiveSha256, archiveSize: archive.byteLength,
  python: { version: process.env.ZEROWALL_MCP_PYTHON_VERSION ?? '3.12', relativeExecutable: 'bio-tools/python/python.exe' },
  mcp: { bioToolsVersion: process.env.ZEROWALL_BIO_TOOLS_VERSION ?? version, ketcherChemistryVersion: process.env.ZEROWALL_KETCHER_VERSION ?? version, toolCount: Number(process.env.ZEROWALL_BIO_TOOL_COUNT ?? 247), licenseToolCount: Number(process.env.ZEROWALL_BIO_LICENSE_TOOL_COUNT ?? 14) },
  source: { claudeScienceRuntime: process.env.ZEROWALL_CLAUDE_SCIENCE_RUNTIME ?? '0.0.37-linux-x64', sourceHashes },
  signature: { algorithm: 'ed25519', keyId: process.env.ZEROWALL_MCP_ENVIRONMENT_KEY_ID ?? 'stable-1', value: '' },
}
const { signature: _signature, ...unsigned } = manifest
manifest.signature.value = sign(null, Buffer.from(JSON.stringify(unsigned)), privateKey).toString('base64')
await writeFile(join(output, `${version}.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
await writeFile(join(output, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`Built ${archiveName} (${archive.byteLength} bytes, ${archiveSha256})`)
