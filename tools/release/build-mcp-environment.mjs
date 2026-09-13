import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { createRequire } from 'node:module'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { patchSciMasterMcp } from './scimaster-compat.mjs'
const JSZip = createRequire(resolve(import.meta.dirname, '../../desktop/package.json'))('jszip')
const execFileAsync = promisify(execFile)

const root = resolve(import.meta.dirname, '../..')
const staging = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_STAGING ?? join(root, 'mcp-environment-staging'))
const output = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_OUTPUT ?? join(root, 'desktop', 'dist', 'mcp-environment'))
const environmentVersion = (process.env.ZEROWALL_MCP_ENVIRONMENT_VERSION ?? process.env.ZEROWALL_MCP_ENVIRONMENT_REVISION ?? '1.2.0').trim()
if (!environmentVersion) throw new Error('ZEROWALL_MCP_ENVIRONMENT_VERSION is required.')
const pythonVersion = process.env.ZEROWALL_MCP_PYTHON_VERSION ?? '3.12'
const pythonRuntime = pythonVersion.match(/^\d+\.\d+/u)?.[0] ?? pythonVersion
// Keep the previous desktop-version field as a compatibility alias for
// clients released before the managed runtime was renamed to ZeroWall Python.
// New clients use environmentVersion exclusively; the alias is signed with
// the manifest and never affects environment identity or update matching.
const legacyApplicationVersion = (process.env.ZEROWALL_MCP_LEGACY_VERSION ?? '').trim()
const contentRevision = Number(process.env.ZEROWALL_MCP_CONTENT_REVISION ?? '1')
if (!Number.isSafeInteger(contentRevision) || contentRevision < 1) throw new Error('ZEROWALL_MCP_CONTENT_REVISION must be a positive integer.')
const privateKeyFile = process.env.ZEROWALL_MCP_ENVIRONMENT_PRIVATE_KEY_FILE?.trim() || undefined
const privateKeyText = (privateKeyFile === undefined
  ? (process.env.ZEROWALL_MCP_ENVIRONMENT_PRIVATE_KEY ?? '')
  : await readFile(resolve(privateKeyFile), 'utf8')).trim()
if (!privateKeyText) throw new Error('ZEROWALL_MCP_ENVIRONMENT_PRIVATE_KEY is required and must never be committed.')
const privateKey = privateKeyText.startsWith('base64:')
  ? createPrivateKey({ key: Buffer.from(privateKeyText.slice('base64:'.length), 'base64'), format: 'der', type: 'pkcs8' })
  : privateKeyText

const keyId = process.env.ZEROWALL_MCP_ENVIRONMENT_KEY_ID ?? 'stable-3'
const expectedPublicKey = (process.env.ZEROWALL_MCP_ENVIRONMENT_PUBLIC_KEY ?? `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA9DJ9yg3F5f67/cEE54AdIDtQshvLP0SF5gVe3F3X+wA=\n-----END PUBLIC KEY-----`).trim()
const derivedPublicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).trim()
if (derivedPublicKey !== expectedPublicKey.trim()) throw new Error(`MCP signing key does not match the pinned ${keyId} public key.`)

const excludedStagingFiles = new Set([
  'mcp-private-key.pem',
  'mcp-public-key.pem',
])

function lockedPackages(text) {
  return text.split(/\r?\n/u).filter(line => /^[A-Za-z0-9][A-Za-z0-9_.-]*==[^\s]+$/u.test(line)).map(line => {
    const [name, requiredVersion] = line.split('==')
    return { name, requiredVersion }
  })
}

async function checkMcpServer(command, args, cwd) {
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'zerowall-build', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ]
  await new Promise((resolveCheck, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'pipe' })
    let output = ''; let settled = false
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); child.kill(); error ? reject(error) : resolveCheck() }
    const timer = setTimeout(() => finish(new Error(`MCP build smoke test timed out: ${args.at(-1) ?? command}`)), 20_000)
    child.once('error', finish)
    let stderr = ''
    child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-2_000) })
    child.once('exit', code => { if (!settled) finish(new Error(`MCP build smoke test exited early (${code ?? 'unknown'}): ${stderr.trim()}`)) })
    child.stdout.on('data', chunk => {
      output += String(chunk)
      for (const line of output.split(/\r?\n/u)) {
        try { const reply = JSON.parse(line); if (reply.id === 2 && Array.isArray(reply.result?.tools)) return finish() } catch { /* wait for a complete JSON line */ }
      }
    })
    child.stdin.end(`${requests.map(item => JSON.stringify(item)).join('\n')}\n`)
  })
}

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

await execFileAsync(process.execPath, [join(root, 'tools', 'release', 'audit-skill-dependencies.mjs')], { cwd: root, windowsHide: true })
const skillAudit = JSON.parse(await readFile(join(root, 'resources', 'python', 'skill-dependencies.json'), 'utf8'))
const scienceLockPath = join(root, 'resources', 'python', 'requirements-science.lock')
const compatibleLockPath = join(root, 'resources', 'python', 'requirements-managed-compatible.lock')
const scienceLock = await readFile(scienceLockPath, 'utf8')
const compatibleLock = await readFile(compatibleLockPath, 'utf8')
const corePackages = [...new Map([...lockedPackages(scienceLock), ...lockedPackages(compatibleLock)].map(item => [item.name.toLowerCase(), item])).values()]

const pythonExecutable = join(staging, 'bio-tools', 'python', 'python.exe')
const sitePackages = join(staging, 'bio-tools', 'python', 'site-packages')
if (process.env.ZEROWALL_MCP_REBUILD_PYTHON !== '0') {
  await rm(sitePackages, { recursive: true, force: true })
  await mkdir(sitePackages, { recursive: true })
  const buildPython = process.env.ZEROWALL_MCP_BUILD_PYTHON ?? (process.platform === 'win32' ? 'py' : 'python3')
  const buildPythonArgs = process.platform === 'win32' && buildPython.toLowerCase() === 'py' ? ['-3.12'] : []
  await execFileAsync(buildPython, [...buildPythonArgs, '-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', '--target', sitePackages, '-r', scienceLockPath, '-r', compatibleLockPath], {
    cwd: staging, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  })
}

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
const requiredPthEntries = ['site-packages/win32', 'site-packages/win32/lib', 'site-packages/pythonwin', `../../../../python-overlay/python-${pythonRuntime}`]
const missingPthEntries = requiredPthEntries.filter(entry => !embeddedPthText.split(/\r?\n/u).includes(entry))
if (missingPthEntries.length > 0) await writeFile(embeddedPth, `${embeddedPthText.trimEnd()}\n${missingPthEntries.join('\n')}\n`, 'utf8')
const managedPythonModules = ['mcp', 'numpy', 'pandas', 'httpx', 'openpyxl', 'pypdf', 'fitz', 'docx', 'pptx', 'matplotlib', 'Bio', 'anndata', 'scanpy', 'mygene', 'gseapy', 'polars', 'pyarrow', 'markitdown', 'liteparse']
const managedPythonImports = managedPythonModules.join(', ')
const managedPythonEnv = { ...process.env, PYTHONPATH: sitePackages, PYTHONNOUSERSITE: '1' }
await execFileAsync(pythonExecutable, ['-c', `import ${managedPythonImports}`], {
  cwd: staging,
  env: managedPythonEnv,
  windowsHide: true,
})
await execFileAsync(pythonExecutable, ['-m', 'pip', 'check'], { cwd: staging, env: managedPythonEnv, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
for (const script of [join(root, 'resources', 'skills', 'zerowall-literature', 'scripts', 'literature_pipeline.py'), join(root, 'resources', 'skills', 'zerowall-literature', 'scripts', 'paper_download_bridge.py')]) {
  await execFileAsync(pythonExecutable, ['-m', 'py_compile', script], { cwd: staging, env: managedPythonEnv, windowsHide: true })
}
await checkMcpServer(pythonExecutable, ['run_server.py', 'mcp_bio'], join(staging, 'bio-tools'))
await checkMcpServer(process.execPath, ['server.js'], join(staging, 'ketcher-chemistry'))
await checkMcpServer(process.execPath, ['dist/mcp.cjs'], join(staging, 'sci'))
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
// Ship the reproducible dependency inputs alongside the managed runtime so
// diagnostics and future environment updates use the same source of truth.
for (const name of ['requirements-mcp.txt', 'requirements-base.txt', 'requirements-science.txt', 'requirements-science.lock', 'requirements-mineru.txt', 'requirements-managed-ui.txt', 'requirements-managed-compatible.txt', 'requirements-managed-compatible.lock', 'skill-dependencies.json']) {
  const path = join(root, 'resources', 'python', name)
  try { zip.file(`python/${name}`, await readFile(path)) } catch { /* optional layer may be absent in older checkouts */ }
}
const archiveName = `zerowall-python-windows-x64-${environmentVersion}.zip`
const archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
const archivePath = join(output, archiveName)
await writeFile(archivePath, archive)
const archiveSha256 = createHash('sha256').update(archive).digest('hex')
const sourceHashes = {}
for (const path of stagingFiles) {
  const rel = relative(staging, path).replaceAll('\\', '/')
  sourceHashes[rel] = createHash('sha256').update(rel === 'sci/dist/mcp.cjs' ? patchedSciMcp : await readFile(path)).digest('hex')
}
const baseUrl = (process.env.ZEROWALL_PYTHON_BASE_URL ?? process.env.ZEROWALL_MCP_ENVIRONMENT_BASE_URL ?? 'https://zerowall.chengxunkeji.cn/stable/zerowall-python/windows-x64').replace(/\/$/u, '')
const manifest = {
  schema: 2, environmentVersion, ...(legacyApplicationVersion ? { version: legacyApplicationVersion } : {}), contentRevision, environmentId: 'zerowall-python', platform: 'win32', architecture: 'x64',
  archiveUrl: `${baseUrl}/${environmentVersion}/${archiveName}`, archiveSha256, archiveSize: archive.byteLength,
  python: { version: pythonVersion, relativeExecutable: 'bio-tools/python/python.exe', relativeSitePackages: 'bio-tools/python/site-packages', modules: managedPythonModules, layers: ['base', 'science', 'managed-compatible', 'mineru-optional'], dependencyManifests: ['python/requirements-base.txt', 'python/requirements-science.txt', 'python/requirements-science.lock', 'python/requirements-managed-compatible.lock', 'python/requirements-mineru.txt'], supportsZeroWallTool: true },
  pythonHealth: { imports: managedPythonModules, optionalLayers: { mineru: ['mineru'] }, bioServer: 'bio-tools/run_server.py mcp_bio', ketcherServer: 'ketcher-chemistry/server.js' },
  dependencies: { corePackages, userOverlay: { enabled: true, path: `python-overlay/python-${pythonRuntime}`, requirementsFile: 'requirements-user.txt' } },
  skillsAudit: skillAudit,
  updatePolicy: { required: true, reason: 'Repairs managed dependency coverage and Python overlay visibility.' },
  skillsRoot: 'skills',
  sci: { version: process.env.ZEROWALL_SCIMASTER_VERSION ?? '0.3.15', nodeMinimum: '20.3.0', cli: 'sci/dist/cli.mjs', mcp: 'sci/dist/mcp.cjs' },
  mcp: { bioToolsVersion: process.env.ZEROWALL_BIO_TOOLS_VERSION ?? environmentVersion, ketcherChemistryVersion: process.env.ZEROWALL_KETCHER_VERSION ?? environmentVersion, sciMasterVersion: process.env.ZEROWALL_SCIMASTER_VERSION ?? '0.3.15', publicToolCount: Number(process.env.ZEROWALL_BIO_PUBLIC_TOOL_COUNT ?? 8), internalToolCount: Number(process.env.ZEROWALL_BIO_INTERNAL_TOOL_COUNT ?? 247), servers: ['zerowall_managed_bio_tools', 'zerowall_managed_ketcher', 'zerowall_managed_scimaster'] },
  source: { claudeScienceRuntime: process.env.ZEROWALL_CLAUDE_SCIENCE_RUNTIME ?? '0.0.37-linux-x64', sourceHashes },
  signature: { algorithm: 'ed25519', keyId, value: '' },
}
const { signature: _signature, ...unsigned } = manifest
manifest.signature.value = sign(null, Buffer.from(JSON.stringify(unsigned)), privateKey).toString('base64')
if (!verify(null, Buffer.from(JSON.stringify(unsigned)), expectedPublicKey, Buffer.from(manifest.signature.value, 'base64'))) throw new Error('MCP manifest self-verification failed.')
await writeFile(join(output, `${environmentVersion}.json`), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
await writeFile(join(output, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`Built ${archiveName} (${archive.byteLength} bytes, ${archiveSha256})`)
