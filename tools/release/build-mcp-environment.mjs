import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve } from 'node:path'
import { patchSciMasterMcp } from './scimaster-compat.mjs'
const execFileAsync = promisify(execFile)

const root = resolve(import.meta.dirname, '../..')
const staging = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_STAGING ?? join(root, 'mcp-environment-staging'))
const output = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_OUTPUT ?? join(root, 'desktop', 'dist', 'mcp-environment'))
const environmentVersion = (process.env.ZEROWALL_MCP_ENVIRONMENT_VERSION ?? process.env.ZEROWALL_MCP_ENVIRONMENT_REVISION ?? '1.4.0').trim()
if (!environmentVersion) throw new Error('ZEROWALL_MCP_ENVIRONMENT_VERSION is required.')
const pythonVersion = process.env.ZEROWALL_MCP_PYTHON_VERSION ?? '3.12.10'
if (pythonVersion !== '3.12.10') throw new Error('This release profile requires Python 3.12.10 exactly.')
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

async function checkMcpServer(command, args, cwd) {
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'zerowall-build', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ]
  await new Promise((resolveCheck, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PYTHONNOUSERSITE: '1', PYTHONPATH: '' }, stdio: 'pipe' })
    let output = ''; let settled = false; let initialized = false
    const finish = error => { if (settled) return; settled = true; clearTimeout(timer); child.kill(); error ? reject(error) : resolveCheck() }
    const timer = setTimeout(() => finish(new Error(`MCP build smoke test timed out: ${args.at(-1) ?? command}`)), 60_000)
    child.once('error', finish)
    let stderr = ''
    child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-2_000) })
    child.once('exit', code => { if (!settled) finish(new Error(`MCP build smoke test exited early (${code ?? 'unknown'}): ${stderr.trim()}`)) })
    child.stdout.on('data', chunk => {
      output += String(chunk)
      const lines = output.split(/\r?\n/u); output = lines.pop() ?? ''
      for (const line of lines) {
        let reply
        try { reply = JSON.parse(line) } catch { continue }
        if (reply.id === 1) {
          if (reply.error || !reply.result) return finish(new Error('MCP initialize failed'))
          initialized = true
          child.stdin.write(`${requests.slice(1).map(item => JSON.stringify(item)).join('\n')}\n`)
        }
        if (reply.id === 2) {
          if (!initialized || reply.error || !Array.isArray(reply.result?.tools) || !reply.result.tools.length) return finish(new Error('MCP tools/list failed'))
          console.log(`MCP verified ${cwd}: ${reply.result.tools.length} tools`)
          return finish()
        }
      }
    })
    child.stdin.write(`${JSON.stringify(requests[0])}\n`)
  })
}

await stat(join(staging, 'bio-tools', 'python', 'python.exe'))
await stat(join(staging, 'bio-tools', 'run_server.py'))
await stat(join(staging, 'ketcher-chemistry', 'server.js'))
await stat(join(root, 'resources', 'skills'))
const sciMcpPath = join(staging, 'sci', 'dist', 'mcp.cjs')
await stat(sciMcpPath)

const finalLockPath = join(root, 'resources', 'python', 'requirements-windows.lock')
const finalLock = await readFile(finalLockPath, 'utf8')
const corePackages = [...finalLock.matchAll(/^([A-Za-z0-9_.-]+)==([^\s]+) --hash=sha256:[a-f0-9]{64}$/gmu)].map(match => ({ name: match[1], requiredVersion: match[2] }))
if (corePackages.length < 127) throw new Error('Final hashed Windows lock is missing or incomplete.')
const pythonExecutable = join(staging, 'bio-tools', 'python', 'python.exe')
const sitePackages = join(staging, 'bio-tools', 'python', 'site-packages')
const buildPython = process.env.ZEROWALL_MCP_BUILD_PYTHON ?? (process.platform === 'win32' ? 'py' : 'python3')
const buildPythonArgs = process.platform === 'win32' && buildPython.toLowerCase() === 'py' ? ['-3.12'] : []
if (process.env.ZEROWALL_MCP_REBUILD_PYTHON !== '0') {
  throw new Error('Prepare a clean runtime with tools/release/prepare-python-environment.py, then set ZEROWALL_MCP_REBUILD_PYTHON=0. The complete inventory and functional evidence are still mandatory.')
}
const verificationPath = process.env.ZEROWALL_PYTHON_VERIFICATION
if (!verificationPath) throw new Error('ZEROWALL_PYTHON_VERIFICATION must identify the functional acceptance report.')
const verification = JSON.parse(await readFile(verificationPath, 'utf8'))
if (!verification.ok || verification.python !== '3.12.10' || !verification.isolated || Object.keys(verification.cases ?? {}).length < 16 || Object.values(verification.cases).some(item => item.ok !== true)) throw new Error('Isolated functional acceptance failed or is incomplete.')
const inventoryResult = await execFileAsync(pythonExecutable, ['-s', '-B', '-c', 'import importlib.metadata as m,json,re,sys; print(json.dumps({re.sub(r"[-_.]+","-",d.metadata["Name"]).lower():d.version for d in m.distributions(path=[sys.argv[1]])}))', sitePackages], { windowsHide: true, env: { ...process.env, PYTHONNOUSERSITE: '1', PYTHONPATH: '' } })
const installed = JSON.parse(inventoryResult.stdout)
if (Object.keys(installed).length !== corePackages.length || corePackages.some(pkg => installed[pkg.name] !== pkg.requiredVersion || verification.packages[pkg.name] !== pkg.requiredVersion)) throw new Error('Lock, installed runtime and functional report package inventories differ.')
await execFileAsync(pythonExecutable, ['-s', '-B', '-c', 'import sys; assert sys.version_info[:3] == (3,12,10)'], { windowsHide: true })
await execFileAsync(pythonExecutable, ['-s', '-B', join(root, 'tools/release/audit-skill-dependencies.py'), '--site-packages', sitePackages, '--verification', verificationPath], { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
const skillAudit = JSON.parse(await readFile(join(root, 'resources/python/skill-dependencies.json'), 'utf8'))
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
const managedPythonModules = Object.entries(verification.imports).filter(([, result]) => result.ok).map(([name]) => name)
for (const name of ['cv2', 'imagehash', 'skimage', 'structlog', 'pikepdf', 'markdown', 'pyzotero']) {
  if (!managedPythonModules.includes(name)) throw new Error(`Mandatory module was not verified: ${name}`)
}
const managedPythonImports = managedPythonModules.join(', ')
const managedPythonEnv = { ...process.env, PYTHONPATH: '', PYTHONNOUSERSITE: '1' }
await execFileAsync(pythonExecutable, ['-s', '-B', '-c', `import ${managedPythonImports}`], {
  cwd: staging,
  env: managedPythonEnv,
  windowsHide: true,
})
await execFileAsync(pythonExecutable, ['-s', '-B', '-m', 'pip', 'check'], { cwd: staging, env: managedPythonEnv, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
await checkMcpServer(pythonExecutable, ['run_server.py', 'mcp_bio'], join(staging, 'bio-tools'))
await checkMcpServer(process.execPath, ['server.js'], join(staging, 'ketcher-chemistry'))
await checkMcpServer(process.execPath, ['dist/mcp.cjs'], join(staging, 'sci'))
await mkdir(output, { recursive: true })
const archiveName = `zerowall-python-windows-x64-${environmentVersion}.zip`
const archivePath = join(output, archiveName)
try { await stat(archivePath); throw new Error('Refusing to overwrite an existing release archive.') } catch (error) { if (error.code !== 'ENOENT') throw error }
const patchedSciMcp = patchSciMasterMcp(await readFile(sciMcpPath))
await writeFile(sciMcpPath, patchedSciMcp)
await execFileAsync(buildPython, [...buildPythonArgs, '-s', '-B', join(root, 'tools/release/pack-python-environment.py'), staging, root, archivePath], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
const archiveInventory = JSON.parse(await readFile(archivePath.replace(/\.zip$/u, '.inventory.json'), 'utf8'))
const archiveSha256 = archiveInventory.sha256
const archiveSize = archiveInventory.size
const sourceHashes = archiveInventory.sourceHashes
const baseUrl = (process.env.ZEROWALL_PYTHON_BASE_URL ?? process.env.ZEROWALL_MCP_ENVIRONMENT_BASE_URL ?? 'https://zerowall.chengxunkeji.cn/stable/zerowall-python/windows-x64').replace(/\/$/u, '')
const manifest = {
  schema: 2, environmentVersion, ...(legacyApplicationVersion ? { version: legacyApplicationVersion } : {}), contentRevision, environmentId: 'zerowall-python', platform: 'win32', architecture: 'x64',
  archiveUrl: `${baseUrl}/${environmentVersion}/${archiveName}`, archiveSha256, archiveSize,
  python: { version: pythonVersion, relativeExecutable: 'bio-tools/python/python.exe', relativeSitePackages: 'bio-tools/python/site-packages', modules: managedPythonModules, layers: ['base', 'science', 'managed-compatible', 'integrity', 'research'], dependencyManifests: ['python/requirements-windows.lock', 'python/requirements-research.txt', 'python/requirements-research.lock', 'python/skill-dependency-policy.json', 'python/requirements-base.txt', 'python/requirements-science.txt', 'python/requirements-science.lock', 'python/requirements-managed-compatible.lock', 'python/requirements-integrity.lock', 'python/requirements-mineru.txt'], supportsZeroWallTool: true },
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
console.log(`Built ${archiveName} (${archiveSize} bytes, ${archiveSha256})`)
