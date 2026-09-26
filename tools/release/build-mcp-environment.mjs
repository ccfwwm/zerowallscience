import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { rootCertificates } from 'node:tls'
import { join, resolve } from 'node:path'
import { patchSciMasterMcp } from './scimaster-compat.mjs'
import { applySourceDistributions, assertCompletePartition, normalizePackageName, parseDirectRequirements, parseLockedPackages, partitionLock, scienceManifestDocument, scienceManifestName, signDocument } from './python-layer-split.mjs'
const execFileAsync = promisify(execFile)

async function copyOwnedStaging(source, target) {
  const started = Date.now()
  if (process.platform !== 'win32') {
    await cp(source, target, { recursive: true, filter: path => !path.includes('__pycache__') })
  } else {
    // target is a fresh mkdtemp below. /XJ prevents following junctions into
    // user data; /E only copies and cannot purge the source or destination.
    await new Promise((accept, reject) => {
      const child = spawn('robocopy.exe', [resolve(source), resolve(target), '/E', '/COPY:DAT', '/DCOPY:DAT', '/XJ', '/MT:8', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XD', '__pycache__'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = ''
      for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output = (output + data).slice(-4000) })
      child.once('error', reject)
      child.once('exit', code => code !== null && code < 8 ? accept() : reject(new Error(`Owned Python staging copy failed (${code}): ${output}`)))
    })
  }
  console.log(`Copied owned Python staging in ${Date.now() - started} ms`)
}

const root = resolve(import.meta.dirname, '../..')
const staging = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_STAGING ?? join(root, 'mcp-environment-staging'))
const pythonVersion = process.env.ZEROWALL_MCP_PYTHON_VERSION ?? '3.12.10'
const environmentVersion = (process.env.ZEROWALL_MCP_ENVIRONMENT_VERSION ?? process.env.ZEROWALL_MCP_ENVIRONMENT_REVISION ?? pythonVersion).trim()
const output = resolve(process.env.ZEROWALL_MCP_ENVIRONMENT_OUTPUT ?? join(root, 'desktop', 'dist', `python-base-${environmentVersion}`))
if (!environmentVersion) throw new Error('ZEROWALL_MCP_ENVIRONMENT_VERSION is required.')
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

// Normalize pre-7.1 staging once at the build boundary. Windows treats
// ``Python`` and ``python`` as the same directory, so dependency metadata
// moves under ``resources/python`` before the interpreter is created.
const legacyResourcePython = join(staging, 'python')
const resourcePython = join(staging, 'resources', 'python')
if (!await stat(resourcePython).then(value => value.isDirectory(), () => false) && await stat(legacyResourcePython).then(value => value.isDirectory(), () => false) && !await stat(join(legacyResourcePython, 'python.exe')).then(value => value.isFile(), () => false)) {
  const { mkdir, rename } = await import('node:fs/promises')
  await mkdir(join(staging, 'resources'), { recursive: true })
  await rename(legacyResourcePython, resourcePython)
}
const legacyPythonRoot = join(staging, 'bio-tools', 'python')
const sharedPythonRoot = join(staging, 'Python')
if (!await stat(sharedPythonRoot).then(value => value.isDirectory(), () => false) && await stat(legacyPythonRoot).then(value => value.isDirectory(), () => false)) {
  const { rename } = await import('node:fs/promises')
  await rename(legacyPythonRoot, sharedPythonRoot)
}
const embeddedPthPath = join(sharedPythonRoot, 'python312._pth')
await writeFile(embeddedPthPath, 'python312.zip\n.\nLib/site-packages\n../bio-tools/lib\nLib/site-packages/win32\nLib/site-packages/win32/lib\nLib/site-packages/pythonwin\nimport site\n', 'utf8')
const legacySitePackages = join(sharedPythonRoot, 'site-packages')
const sharedSitePackages = join(sharedPythonRoot, 'Lib', 'site-packages')
if (!await stat(sharedSitePackages).then(value => value.isDirectory(), () => false) && await stat(legacySitePackages).then(value => value.isDirectory(), () => false)) {
  const { mkdir, rename } = await import('node:fs/promises')
  await mkdir(join(sharedPythonRoot, 'Lib'), { recursive: true })
  await rename(legacySitePackages, sharedSitePackages)
}
await stat(join(sharedPythonRoot, 'python.exe'))
await stat(join(staging, 'bio-tools', 'run_server.py'))
await stat(join(staging, 'ketcher-chemistry', 'server.js'))
await stat(join(root, 'resources', 'skills'))
const sciMcpPath = join(staging, 'sci', 'dist', 'mcp.cjs')
await stat(sciMcpPath)

const finalLockPath = join(root, 'resources', 'python', 'requirements-windows.lock')
const finalLock = await readFile(finalLockPath, 'utf8')
const lockedPackages = parseLockedPackages(finalLock)
const installPackages = applySourceDistributions(lockedPackages, await readFile(join(root, 'resources/python/requirements-research.lock'), 'utf8'), JSON.parse(await readFile(join(root, 'resources/python/source-distributions.json'), 'utf8')))
const pythonExecutable = join(sharedPythonRoot, 'python.exe')
const sitePackages = join(sharedPythonRoot, 'Lib', 'site-packages')
const buildPython = process.env.ZEROWALL_MCP_BUILD_PYTHON ?? (process.platform === 'win32' ? 'py' : 'python3')
const buildPythonArgs = process.platform === 'win32' && buildPython.toLowerCase() === 'py' ? ['-3.12'] : []
if (process.env.ZEROWALL_MCP_REBUILD_PYTHON !== '0') {
  throw new Error('Prepare a clean runtime with tools/release/prepare-python-environment.py, then set ZEROWALL_MCP_REBUILD_PYTHON=0. The complete inventory and functional evidence are still mandatory.')
}
const verificationPath = process.env.ZEROWALL_PYTHON_VERIFICATION
const baseOnly = process.env.ZEROWALL_PYTHON_BASE_ONLY === '1'
if (!verificationPath && !baseOnly) throw new Error('ZEROWALL_PYTHON_VERIFICATION must identify the functional acceptance report.')
const verification = verificationPath ? JSON.parse(await readFile(verificationPath, 'utf8')) : undefined
if (!baseOnly && (!verification?.ok || verification.python !== '3.12.10' || verification.runtimeMode !== 'shared' || Object.keys(verification.cases ?? {}).length < 16 || Object.values(verification.cases).some(item => item.ok !== true))) throw new Error('Shared-runtime functional acceptance failed or is incomplete.')
const inventoryResult = await execFileAsync(pythonExecutable, ['-s', '-B', '-c', 'import importlib.metadata as m,json,re,sys; print(json.dumps({re.sub(r"[-_.]+","-",d.metadata["Name"]).lower():d.version for d in m.distributions(path=[sys.argv[1]])}))', sitePackages], { windowsHide: true, env: { ...process.env, PYTHONNOUSERSITE: '1', PYTHONPATH: '' } })
const installed = JSON.parse(inventoryResult.stdout)

// The archive now ships only the layer that must stay offline and bootable; the
// scientific layer is published separately so a version bump never forces a
// multi-gigabyte archive re-download. BASE is the closure of the base profile
// plus the interpreter bootstrap over installed `Requires-Dist` edges, and the
// remaining lock entries are the science layer.
const layerPolicy = JSON.parse(await readFile(join(root, 'resources', 'python', 'science-layer-policy.json'), 'utf8'))
const baseRequirements = await readFile(join(root, 'resources', 'python', layerPolicy.baseRequirementsFile), 'utf8')
const edgeResult = await execFileAsync(pythonExecutable, ['-s', '-B', '-c', `import importlib.metadata as m,json,re,sys
from packaging.requirements import Requirement
edges={}
for d in m.distributions(path=[sys.argv[1]]):
    deps=set()
    for raw in (d.requires or []):
        try:
            r=Requirement(raw)
            if r.marker is not None and not r.marker.evaluate(): continue
            deps.add(re.sub(r"[-_.]+","-",r.name).lower())
        except Exception: pass
    edges[re.sub(r"[-_.]+","-",d.metadata["Name"]).lower()]=sorted(deps)
print(json.dumps(edges))`, sitePackages], { windowsHide: true, env: { ...process.env, PYTHONNOUSERSITE: '1', PYTHONPATH: '' }, maxBuffer: 16 * 1024 * 1024 })
const edges = new Map(Object.entries(JSON.parse(edgeResult.stdout)))
const split = partitionLock({ packages: lockedPackages, edges, roots: [...parseDirectRequirements(baseRequirements), ...layerPolicy.baseRoots] })
assertCompletePartition({ packages: lockedPackages, ...split })
if (split.rootsNotInLock.length > 0) throw new Error(`Science layer base roots are not in the hashed lock: ${split.rootsNotInLock.join(', ')}.`)
if (split.closureNotInLock.length > 0) throw new Error(`The hashed lock is missing dependencies of the base layer: ${split.closureNotInLock.join(', ')}.`)
if (split.base.length < layerPolicy.minBasePackages) throw new Error(`Base layer resolved to ${split.base.length} packages, below the ${layerPolicy.minBasePackages} floor.`)
for (const module of layerPolicy.mandatoryBaseModules) {
  if (!split.baseNames.has(normalizePackageName(module))) throw new Error(`Mandatory base module resolves outside the base layer: ${module}`)
}

// A staging runtime must match the lock exactly before it can be split, and each
// layer's installed version must agree with both the lock and the functional
// report. Comparing per layer instead of against the whole lock keeps the old
// three-way invariant while the shipped archive becomes the smaller BASE set.
const installedNames = new Set(Object.keys(installed).map(normalizePackageName))
const lockNames = new Set(lockedPackages.keys())
if ([...installedNames].some(name => !lockNames.has(name)) || (!baseOnly && [...lockNames].some(name => !installedNames.has(name)))) throw new Error('Installed runtime and hashed lock package inventories differ.')
for (const pkg of [...split.base, ...split.science]) {
  const name = normalizePackageName(pkg.name)
  if ((installed[name] !== undefined && installed[name] !== pkg.version) || (split.baseNames.has(name) && installed[name] !== pkg.version) || (!baseOnly && (installed[name] !== pkg.version || verification.packages[name] !== pkg.version))) throw new Error(`Lock, installed runtime and functional report disagree on ${pkg.name}.`)
}
const corePackages = split.base.map(pkg => ({ name: pkg.name, requiredVersion: pkg.version }))
const sciencePackages = split.science
// Only pip is part of the offline bootstrap. setuptools and packaging are
// ordinary required entries in the signed dependency manifest, so they must
// never leak into the small Python archive merely to support build-time work.
if (!installed.pip) throw new Error('The staging runtime is missing its pip bootstrap distribution.')
await execFileAsync(pythonExecutable, ['-s', '-B', '-c', 'import sys; assert sys.version_info[:3] == (3,12,10)'], { windowsHide: true })
if (!baseOnly) await execFileAsync(pythonExecutable, ['-s', '-B', join(root, 'tools/release/audit-skill-dependencies.py'), '--site-packages', sitePackages, '--verification', verificationPath], { cwd: root, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
const skillAudit = JSON.parse(await readFile(join(root, 'resources/python/skill-dependencies.json'), 'utf8'))
// All compatibility edits happen in an owned candidate copy. The source may
// be the user's currently running interpreter and must remain read-only.
const prunedStaging = await mkdtemp(join(tmpdir(), 'zerowall-base-layer-'))
await copyOwnedStaging(staging, prunedStaging)
const embeddedPth = join(prunedStaging, 'Python', 'python312._pth')
const embeddedPthText = await readFile(embeddedPth, 'utf8')
const pthLines = embeddedPthText.split(/\r?\n/u).filter(line => !/python-overlay|user-overlay/iu.test(line))
if (pthLines.join('\n') !== embeddedPthText.replace(/\r\n/gu, '\n').trimEnd()) await writeFile(embeddedPth, `${pthLines.join('\n').trimEnd()}\n`, 'utf8')
// Older archives omitted public PEM files. Repair only the owned candidate
// using the trusted Node root store; never disable Python TLS verification.
for (const module of ['certifi', 'pip/_vendor/certifi']) {
  const directory = join(prunedStaging, 'Python', 'Lib', 'site-packages', module)
  const certificate = join(directory, 'cacert.pem')
  if (await stat(directory).then(value => value.isDirectory(), () => false) && !await stat(certificate).then(value => value.isFile(), () => false)) {
    await writeFile(certificate, rootCertificates.join('\n'))
  }
}
const managedPythonModules = baseOnly ? layerPolicy.mandatoryBaseModules.map(name => ({ pillow: 'PIL', 'python-dotenv': 'dotenv' })[name] ?? name) : Object.entries(verification.imports).filter(([, result]) => result.ok).map(([name]) => name)
// The shipped archive only contains BASE, so its health probe and its declared
// module list may only name BASE modules; a probe for an absent package would
// fail the client's post-install check. The science imports stay release
// evidence instead: they prove the published science manifest describes a set
// that was functionally verified, without shipping it.
const importAliases = { pillow: 'PIL', 'python-dotenv': 'dotenv' }
const baseImportNames = layerPolicy.mandatoryBaseModules.map(name => importAliases[name] ?? name)
const shippedModules = baseImportNames.filter(name => managedPythonModules.includes(name))
if (shippedModules.length !== baseImportNames.length) throw new Error(`Mandatory base module was not verified: ${baseImportNames.filter(name => !managedPythonModules.includes(name)).join(', ')}`)
for (const module of baseOnly ? [] : layerPolicy.mandatoryScienceModules) {
  if (!managedPythonModules.includes(module)) throw new Error(`Mandatory science module was not verified: ${module}`)
}
const managedPythonImports = shippedModules.join(', ')
const managedPythonEnv = { ...process.env, PYTHONPATH: '', PYTHONNOUSERSITE: '1' }
await execFileAsync(pythonExecutable, ['-s', '-B', '-c', `import ${managedPythonImports}`], {
  cwd: staging,
  env: managedPythonEnv,
  windowsHide: true,
})

// Prune a copy rather than the checked-in staging tree: the packer consumes a
// whole directory, and the build input has to stay usable for the next release.
const prunedSitePackages = join(prunedStaging, 'Python', 'Lib', 'site-packages')
await execFileAsync(pythonExecutable, ['-s', '-B', '-c', `import importlib.metadata as m,json,pathlib,re,shutil,sys
site=pathlib.Path(sys.argv[1]).resolve()
wanted=set(json.loads(sys.argv[2]))
distributions=list(m.distributions(path=[str(site)]))
keep=set()
removed=[]
for d in distributions:
    name=re.sub(r"[-_.]+","-",d.metadata["Name"]).lower()
    metadata=pathlib.Path(d._path).resolve()
    if name in wanted:
        # Keep exactly the files recorded by retained distributions. This is
        # deliberately stricter than deleting only non-retained RECORD rows:
        # older staging trees may contain orphaned console scripts and shared
        # data directories without a matching dist-info record.
        for item in (d.files or []):
            p=pathlib.Path(d.locate_file(item)).resolve()
            if p.is_relative_to(site) and p.is_file(): keep.add(p)
        continue
    removed.append(d.metadata["Name"])
    if metadata.is_relative_to(site) and metadata.name.endswith((".dist-info",".egg-info")) and metadata.is_dir(): shutil.rmtree(metadata)
for p in sorted((p for p in site.rglob('*') if p.is_file()), key=lambda p:len(p.parts), reverse=True):
    if p.resolve() not in keep: p.unlink()
for directory in sorted((p for p in site.rglob('*') if p.is_dir()), key=lambda p:len(p.parts), reverse=True):
    try: directory.rmdir()
    except OSError: pass
print(json.dumps(removed))`, prunedSitePackages, JSON.stringify([...split.baseNames])], { windowsHide: true, env: managedPythonEnv, maxBuffer: 16 * 1024 * 1024 })
const residual = await execFileAsync(pythonExecutable, ['-s', '-B', '-c', 'import importlib.metadata as m,json,re,sys; print(json.dumps(sorted(re.sub(r"[-_.]+","-",d.metadata["Name"]).lower() for d in m.distributions(path=[sys.argv[1]]))))', prunedSitePackages], { windowsHide: true, env: managedPythonEnv, maxBuffer: 16 * 1024 * 1024 })
const residualNames = JSON.parse(residual.stdout)
if (residualNames.length !== split.base.length || residualNames.some(name => !split.baseNames.has(name))) throw new Error('Pruned archive runtime does not match the base layer exactly.')
await execFileAsync(join(prunedStaging, 'Python', 'python.exe'), ['-s', '-B', '-c', `import ${managedPythonImports}`], { cwd: prunedStaging, env: managedPythonEnv, windowsHide: true })
await execFileAsync(join(prunedStaging, 'Python', 'python.exe'), ['-s', '-B', '-m', 'pip', 'check'], { cwd: prunedStaging, env: managedPythonEnv, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
// Bio Tools imports scientific packages from the signed dependency list. Its
// handshake is checked against the complete staging runtime, before pruning;
// the first-run base archive only needs Python and pip to pass health checks.
if (!baseOnly) await checkMcpServer(pythonExecutable, ['run_server.py', 'mcp_bio'], join(staging, 'bio-tools'))
await checkMcpServer(process.execPath, ['server.js'], join(prunedStaging, 'ketcher-chemistry'))
await checkMcpServer(process.execPath, ['dist/mcp.cjs'], join(prunedStaging, 'sci'))
await mkdir(output, { recursive: true })
const archiveName = `zerowall-python-windows-x64-${environmentVersion}.zip`
const archivePath = join(output, archiveName)
try { await stat(archivePath); throw new Error('Refusing to overwrite an existing release archive.') } catch (error) { if (error.code !== 'ENOENT') throw error }
const patchedSciMcp = patchSciMasterMcp(await readFile(sciMcpPath))
await writeFile(join(prunedStaging, 'sci', 'dist', 'mcp.cjs'), patchedSciMcp)
await execFileAsync(buildPython, [...buildPythonArgs, '-s', '-B', join(root, 'tools/release/pack-python-environment.py'), prunedStaging, root, archivePath], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
const archiveInventory = JSON.parse(await readFile(archivePath.replace(/\.zip$/u, '.inventory.json'), 'utf8'))
const archiveSha256 = archiveInventory.sha256
const archiveSize = archiveInventory.size
const sourceHashes = archiveInventory.sourceHashes
const baseUrl = (process.env.ZEROWALL_PYTHON_BASE_URL ?? process.env.ZEROWALL_MCP_ENVIRONMENT_BASE_URL ?? 'https://zerowall.chengxunkeji.cn/stable/zerowall-python/windows-x64').replace(/\/$/u, '')
const scienceBaseUrl = (process.env.ZEROWALL_PYTHON_SCIENCE_BASE_URL ?? 'https://zerowall.chengxunkeji.cn/stable/zerowall-science-python/windows-x64').replace(/\/$/u, '')
// The science layer points clients at the Tsinghua mirror by default: the
// managed interpreter is spawned with -I, so pip ignores pip.ini and every
// mirror setting has to travel as an explicit argument.
const scienceIndexUrl = (process.env.ZEROWALL_PYTHON_INDEX_URL ?? 'https://pypi.tuna.tsinghua.edu.cn/simple').replace(/\/$/u, '')
const scienceIndex = { indexUrl: `${scienceIndexUrl}/`, trustedHost: new URL(scienceIndexUrl).hostname }
const scienceRevision = Number(process.env.ZEROWALL_MCP_SCIENCE_REVISION ?? '1')
if (!Number.isSafeInteger(scienceRevision) || scienceRevision < 1) throw new Error('ZEROWALL_MCP_SCIENCE_REVISION must be a positive integer.')
const scienceName = scienceManifestName({ environmentVersion, scienceRevision })
const sciencePath = join(output, scienceName)
try { await stat(sciencePath); throw new Error('Refusing to overwrite an existing science manifest.') } catch (error) { if (error.code !== 'ENOENT') throw error }
const scienceDocument = signDocument(scienceManifestDocument({
  environmentVersion, scienceRevision, pythonVersion, index: scienceIndex,
  basePackageCount: corePackages.length, packages: [...installPackages.values()], keyId,
  applicationVersion: legacyApplicationVersion || JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version,
}), privateKey, expectedPublicKey)
const scienceBytes = Buffer.from(`${JSON.stringify(scienceDocument, null, 2)}\n`)
await writeFile(sciencePath, scienceBytes)
await writeFile(join(output, 'science-latest.json'), scienceBytes)
// The science reference is embedded in the signed archive manifest, so the two
// artifacts cannot be paired incorrectly: the hash is taken over the exact bytes
// published above, including their trailing newline.
const science = {
  manifestUrl: `${scienceBaseUrl}/${scienceName}`, manifestSha256: createHash('sha256').update(scienceBytes).digest('hex'), manifestSize: scienceBytes.length,
  scienceRevision, contentRevision, packageCount: lockedPackages.size, indexUrl: scienceIndex.indexUrl,
}
const manifest = {
  schema: 2, environmentVersion, ...(legacyApplicationVersion ? { version: legacyApplicationVersion } : {}), contentRevision, environmentId: 'zerowall-python', platform: 'win32', architecture: 'x64',
  archiveUrl: `${baseUrl}/${environmentVersion}/${archiveName}`, archiveSha256, archiveSize,
  python: { version: pythonVersion, relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages', modules: shippedModules, layers: ['base', 'science'], dependencyManifests: ['resources/python/requirements-windows.lock', 'resources/python/requirements-base.txt', 'resources/python/skill-dependency-policy.json'], supportsZeroWallTool: true },
  // Every package in the signed dependency manifest is installed into the
  // one shared Python site-packages directory.  Keep health metadata as a
  // complete import list; there is no second or optional Python layer.
  pythonHealth: { imports: shippedModules, bioServer: 'bio-tools/run_server.py mcp_bio', ketcherServer: 'ketcher-chemistry/server.js' },
  dependencies: { corePackages, indexUrl: scienceIndex.indexUrl, science },
  skillsAudit: skillAudit,
  updatePolicy: { required: true, reason: 'Keeps every signed dependency in the one shared Python site-packages directory.' },
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
await writeFile(join(output, 'base-verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), pythonVersion, basePackageCount: corePackages.length, prunedImports: shippedModules, pipCheck: true, mcpHandshake: !baseOnly, fullScienceFunctionalVerified: !baseOnly, archiveSha256 }, null, 2))
await rm(prunedStaging, { recursive: true, force: true })
console.log(`Built ${archiveName} (${archiveSize} bytes, ${archiveSha256}) with ${corePackages.length} base and ${sciencePackages.length} science packages`)
console.log(`Built ${scienceName} (${scienceBytes.length} bytes) for the science layer revision ${scienceRevision}`)
