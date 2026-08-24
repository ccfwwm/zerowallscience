import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { createRequire } from 'node:module'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { patchSciMasterMcp } from './scimaster-compat.mjs'
const JSZip = createRequire(resolve(import.meta.dirname, '../../desktop/package.json'))('jszip')
const execFileAsync = promisify(execFile)

const root = resolve(import.meta.dirname, '../..')
const staging = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_STAGING ?? join(root, 'mcp-environment-staging'))
const output = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_OUTPUT ?? join(root, 'desktop', 'dist', 'mcp-environment'))
const version = process.env.ZEROWALL_MCP_ENVIRONMENT_VERSION?.trim()
if (!version) throw new Error('ZEROWALL_MCP_ENVIRONMENT_VERSION is required.')
const privateKeyFile = process.env.ZEROWALL_MCP_ENVIRONMENT_PRIVATE_KEY_FILE?.trim()
const privateKeyText = (privateKeyFile === undefined
  ? process.env.ZEROWALL_MCP_ENVIRONMENT_PRIVATE_KEY
  : await readFile(resolve(privateKeyFile), 'utf8')).trim()
if (!privateKeyText) throw new Error('ZEROWALL_MCP_ENVIRONMENT_PRIVATE_KEY is required and must never be committed.')
const privateKey = privateKeyText.startsWith('base64:')
  ? createPrivateKey({ key: Buffer.from(privateKeyText.slice('base64:'.length), 'base64'), format: 'der', type: 'pkcs8' })
  : privateKeyText

const keyId = process.env.ZEROWALL_MCP_ENVIRONMENT_KEY_ID ?? 'stable-2'
const expectedPublicKey = (process.env.ZEROWALL_MCP_ENVIRONMENT_PUBLIC_KEY ?? `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAUvKwSI31zGGut3nRi4kRqZGg8eBJskIrfa8Xmp/7VJw=\n-----END PUBLIC KEY-----`).trim()
const derivedPublicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).trim()
if (derivedPublicKey !== expectedPublicKey.trim()) throw new Error(`MCP signing key does not match the pinned ${keyId} public key.`)

const excludedStagingFiles = new Set([
  'mcp-private-key.pem',
  'mcp-public-key.pem',
])

async function filesUnder(path, { exclude = () => false } = {}) {
  const entries = await readdir(path, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const child = join(path, entry.name)
    if (exclude(child, entry)) continue
    if (entry.isDirectory()) files.push(...await filesUnder(child, { exclude }))
    else if (entry.isFile()) files.push(child)
  }
  return files
}

await stat(join(staging, 'bio-tools', 'python', 'python.exe'))
await stat(join(staging, 'bio-tools', 'run_server.py'))
await stat(join(staging, 'ketcher-chemistry', 'server.js'))
await stat(join(root, 'resources', 'skills'))
const sciMcpPath = join(staging, 'sci', 'dist', 'mcp.cjs')
await stat(sciMcpPath)

// The embedded Windows Python uses python312._pth. That mode does not process
// pywin32.pth, so mcp's top-level `import pywintypes` cannot find the shim in
// win32/lib. Keep a private top-level copy in the environment so imports work
// without relying on a machine-wide pywin32 installation.
const pywintypesTarget = join(staging, 'bio-tools', 'python', 'site-packages', 'pywintypes.py')
try {
  await stat(pywintypesTarget)
} catch {
  await copyFile(join(staging, 'bio-tools', 'python', 'site-packages', 'win32', 'lib', 'pywintypes.py'), pywintypesTarget)
}
const embeddedPth = join(staging, 'bio-tools', 'python', 'python312._pth')
const embeddedPthText = await readFile(embeddedPth, 'utf8')
const requiredPthEntries = ['site-packages/win32', 'site-packages/win32/lib', 'site-packages/pythonwin']
const missingPthEntries = requiredPthEntries.filter(entry => !embeddedPthText.split(/\r?\n/u).includes(entry))
if (missingPthEntries.length > 0) await writeFile(embeddedPth, `${embeddedPthText.trimEnd()}\n${missingPthEntries.join('\n')}\n`, 'utf8')
const pythonExecutable = join(staging, 'bio-tools', 'python', 'python.exe')
await execFileAsync(pythonExecutable, ['-c', 'import mcp, numpy, pandas, httpx'], {
  cwd: staging,
  env: { ...process.env, PYTHONNOUSERSITE: '1' },
  windowsHide: true,
})
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
const zip = new JSZip()
const stagingFiles = await filesUnder(staging, {
  exclude: (path, entry) => entry.isFile() && excludedStagingFiles.has(relative(staging, path).replaceAll('\\', '/')),
})
const patchedSciMcp = patchSciMasterMcp(await readFile(sciMcpPath))
for (const path of stagingFiles) {
  const rel = relative(staging, path).replaceAll('\\', '/')
  zip.file(rel, rel === 'sci/dist/mcp.cjs' ? patchedSciMcp : await readFile(path))
}
for (const path of await filesUnder(join(root, 'resources', 'skills'))) {
  const rel = relative(join(root, 'resources', 'skills'), path).replaceAll('\\', '/')
  zip.file(`skills/${rel}`, await readFile(path))
}
const archiveName = `zerowall-mcp-windows-x64-${version}.zip`
const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
const archivePath = join(output, archiveName)
await writeFile(archivePath, archive)
const archiveSha256 = createHash('sha256').update(archive).digest('hex')
const sourceHashes = {}
for (const path of stagingFiles) {
  const rel = relative(staging, path).replaceAll('\\', '/')
  sourceHashes[rel] = createHash('sha256').update(rel === 'sci/dist/mcp.cjs' ? patchedSciMcp : await readFile(path)).digest('hex')
}
const baseUrl = (process.env.ZEROWALL_MCP_ENVIRONMENT_BASE_URL ?? 'https://zerowall.chengxunkeji.cn/stable/mcp-environments/windows-x64').replace(/\/$/u, '')
const manifest = {
  schema: 2, contentRevision: 2, environmentId: 'claude-science-mcp', version, platform: 'win32', architecture: 'x64',
  archiveUrl: `${baseUrl}/${version}/${archiveName}`, archiveSha256, archiveSize: archive.byteLength,
  python: { version: process.env.ZEROWALL_MCP_PYTHON_VERSION ?? '3.12', relativeExecutable: 'bio-tools/python/python.exe', relativeSitePackages: 'bio-tools/python/site-packages', modules: ['mcp', 'numpy', 'pandas', 'httpx'], supportsZeroWallTool: true },
  pythonHealth: { imports: ['mcp', 'numpy', 'pandas', 'httpx'], bioServer: 'bio-tools/run_server.py mcp_bio', ketcherServer: 'ketcher-chemistry/server.js' },
  skillsRoot: 'skills',
  sci: { version: process.env.ZEROWALL_SCIMASTER_VERSION ?? '0.3.15', nodeMinimum: '20.3.0', cli: 'sci/dist/cli.mjs', mcp: 'sci/dist/mcp.cjs' },
  mcp: { bioToolsVersion: process.env.ZEROWALL_BIO_TOOLS_VERSION ?? version, ketcherChemistryVersion: process.env.ZEROWALL_KETCHER_VERSION ?? version, sciMasterVersion: process.env.ZEROWALL_SCIMASTER_VERSION ?? '0.3.15', toolCount: Number(process.env.ZEROWALL_BIO_TOOL_COUNT ?? 247), licenseToolCount: Number(process.env.ZEROWALL_BIO_LICENSE_TOOL_COUNT ?? 14), servers: ['zerowall_managed_bio_tools', 'zerowall_managed_ketcher', 'zerowall_managed_scimaster'] },
  source: { claudeScienceRuntime: process.env.ZEROWALL_CLAUDE_SCIENCE_RUNTIME ?? '0.0.37-linux-x64', sourceHashes },
  signature: { algorithm: 'ed25519', keyId, value: '' },
}
const { signature: _signature, ...unsigned } = manifest
manifest.signature.value = sign(null, Buffer.from(JSON.stringify(unsigned)), privateKey).toString('base64')
if (!verify(null, Buffer.from(JSON.stringify(unsigned)), expectedPublicKey, Buffer.from(manifest.signature.value, 'base64'))) throw new Error('MCP manifest self-verification failed.')
await writeFile(join(output, `${version}.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
await writeFile(join(output, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`Built ${archiveName} (${archive.byteLength} bytes, ${archiveSha256})`)
