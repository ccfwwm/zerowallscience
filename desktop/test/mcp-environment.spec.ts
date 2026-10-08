import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { assertEnvironmentFiles, canonicalManifest, extractZipInWorker, mcpEnvironmentDiagnostic, McpEnvironmentController, pythonCoreRequirements, selectPythonHealthImports, type McpEnvironmentManifest, verifyManifestWithKeyring } from '../src/main/mcp-environment.js'

const roots: string[] = []
const keys = generateKeyPairSync('ed25519')
const testArchive = await new JSZip()
  .file('bio-tools/python/python.exe', '')
  .file('bio-tools/python/Lib/site-packages/.keep', '')
  .file('bio-tools/run_server.py', '')
  .file('ketcher-chemistry/server.js', '')
  .file('sci/dist/cli.mjs', '')
  .file('sci/dist/mcp.cjs', '')
  .file('sci/zerowall-mcp-launcher.cjs', '')
  .file('skills/example/SKILL.md', '')
  .generateAsync({ type: 'nodebuffer' })
const sharedTestArchive = await new JSZip()
  .file('Python/python.exe', 'fixture interpreter')
  .file('Python/Lib/site-packages/.keep', '')
  .generateAsync({ type: 'nodebuffer' })

function signedManifest(version = '4.1.9', keyId = 'stable-1', environmentVersion = '1.0.0', contentRevision = 1): McpEnvironmentManifest {
  const manifest: McpEnvironmentManifest = {
    schema: 2, environmentId: 'claude-science-mcp', environmentVersion, contentRevision, version, platform: 'win32', architecture: 'x64',
    archiveUrl: `https://example.test/${version}.zip`, archiveSha256: createHash('sha256').update(testArchive).digest('hex'), archiveSize: testArchive.byteLength,
    python: { version: '3.12', relativeExecutable: 'bio-tools/python/python.exe', relativeSitePackages: 'bio-tools/python/Lib/site-packages', modules: ['mcp', 'numpy', 'pandas', 'httpx'], supportsZeroWallTool: true },
    pythonHealth: { imports: [], bioServer: 'bio-tools/run_server.py mcp_bio', ketcherServer: 'ketcher-chemistry/server.js' },
    skillsRoot: 'skills', sci: { version: '0.3.15', nodeMinimum: '20.3.0', cli: 'sci/dist/cli.mjs', mcp: 'sci/dist/mcp.cjs' },
    mcp: { bioToolsVersion: version, ketcherChemistryVersion: version, sciMasterVersion: '0.3.15', publicToolCount: 8, internalToolCount: 247, servers: ['zerowall_managed_bio_tools', 'zerowall_managed_ketcher', 'zerowall_managed_scimaster'] },
    source: { claudeScienceRuntime: '0.0.37-linux-x64', sourceHashes: {} }, signature: { algorithm: 'ed25519', keyId, value: '' },
  }
  manifest.signature.value = sign(null, canonicalManifest(manifest), keys.privateKey).toString('base64')
  return manifest
}

function signedSharedManifest(): McpEnvironmentManifest {
  const manifest = signedManifest()
  manifest.environmentId = 'zerowall-python'
  manifest.python.relativeExecutable = 'Python/python.exe'
  manifest.python.relativeSitePackages = 'Python/Lib/site-packages'
  manifest.archiveSha256 = createHash('sha256').update(sharedTestArchive).digest('hex')
  manifest.archiveSize = sharedTestArchive.byteLength
  manifest.signature.value = sign(null, canonicalManifest(manifest), keys.privateKey).toString('base64')
  return manifest
}

async function environment(root: string, manifest: McpEnvironmentManifest): Promise<void> {
  for (const relative of [manifest.python.relativeExecutable, 'bio-tools/run_server.py', 'ketcher-chemistry/server.js', manifest.sci.cli, manifest.sci.mcp, 'sci/zerowall-mcp-launcher.cjs']) {
    const path = join(root, relative)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '')
  }
  await mkdir(join(root, manifest.python.relativeSitePackages), { recursive: true })
  await mkdir(join(root, manifest.skillsRoot), { recursive: true })
  await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest))
}

afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('MCP environment upgrades', () => {
  it('validates the Python generation without requiring separately managed MCP and Skills payloads', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-python-core-only-')); roots.push(root)
    const manifest = signedSharedManifest()
    await mkdir(dirname(join(root, manifest.python.relativeExecutable)), { recursive: true })
    await writeFile(join(root, manifest.python.relativeExecutable), 'python')
    await mkdir(join(root, manifest.python.relativeSitePackages), { recursive: true })
    await expect(assertEnvironmentFiles(root, manifest, {})).resolves.toBeUndefined()
  })

  it('checks an old pip-only generation against the signed desktop core without downgrading newer generations', () => {
    const installed = signedSharedManifest()
    installed.dependencies = { corePackages: [{ name: 'pip', requiredVersion: '25.0' }] }
    const bundled = signedSharedManifest()
    bundled.dependencies = { corePackages: [{ name: 'pip', requiredVersion: '25.0' }, { name: 'mcp', requiredVersion: '1.13.1' }] }
    bundled.signature.value = sign(null, canonicalManifest(bundled), keys.privateKey).toString('base64')
    const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect([...pythonCoreRequirements(installed, bundled, publicKey)]).toEqual([['pip', '25.0'], ['mcp', '1.13.1']])
    installed.contentRevision = 2
    installed.dependencies.corePackages.push({ name: 'mcp', requiredVersion: '1.14.0' })
    expect(pythonCoreRequirements(installed, bundled, publicKey).get('mcp')).toBe('1.14.0')
    bundled.dependencies.corePackages[1]!.requiredVersion = '0.0.0'
    expect(() => pythonCoreRequirements(installed, bundled, publicKey)).toThrow('signature is invalid')
  })

  it('repairs an old pip-only generation explicitly using the bundled archive and preserves a newer generation', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'zerowall-core-repair-')); roots.push(userData)
    const root = join(userData, 'zerowall-python'), assets = join(userData, 'assets')
    const bundled = signedSharedManifest()
    bundled.dependencies = { corePackages: [{ name: 'pip', requiredVersion: '25.0' }, { name: 'mcp', requiredVersion: '1.13.1' }] }
    bundled.signature.value = sign(null, canonicalManifest(bundled), keys.privateKey).toString('base64')
    await environment(assets, bundled)
    const old = signedSharedManifest()
    old.dependencies = { corePackages: [{ name: 'pip', requiredVersion: '25.0' }] }
    old.archiveSha256 = 'a'.repeat(64)
    old.signature.value = sign(null, canonicalManifest(old), keys.privateKey).toString('base64')
    const oldRoot = join(root, 'versions', 'legacy')
    await environment(oldRoot, old)
    await writeFile(join(root, 'current.json'), JSON.stringify({ root: oldRoot, health: 'ready', generation: true }))
    const before = await readFile(join(root, 'current.json'))
    const bundledManifestPath = join(userData, 'base.json'), bundledArchivePath = join(userData, 'base.zip')
    await writeFile(bundledManifestPath, JSON.stringify(bundled)); await writeFile(bundledArchivePath, sharedTestArchive)
    const fetcher = vi.fn(async () => { throw new Error('Legacy remote archive must not be fetched') })
    const controller = new McpEnvironmentController({ generationMode: true, root, bundledManifestPath, bundledArchivePath,
      bundledAssets: { bioToolsRoot: join(assets, 'bio-tools'), ketcherRoot: join(assets, 'ketcher-chemistry'), sciRoot: join(assets, 'sci'), skillsRoot: join(assets, 'skills') },
      manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), fetcher, healthCheck: async () => {}, publish() {} })
    await controller.localStatus()
    expect(await readFile(join(root, 'current.json'))).toEqual(before)
    expect((await controller.initialize()).phase).toBe('ready')
    const repaired = JSON.parse(await readFile(join(root, 'current.json'), 'utf8'))
    expect(repaired.root).not.toBe(oldRoot)
    expect(JSON.parse(await readFile(join(repaired.root, 'manifest.json'), 'utf8')).dependencies.corePackages).toHaveLength(2)
    expect(await readFile(join(oldRoot, 'manifest.json'), 'utf8')).toContain(old.archiveSha256)
    const newer = { ...bundled, contentRevision: 2 }
    newer.signature.value = sign(null, canonicalManifest(newer), keys.privateKey).toString('base64')
    await writeFile(join(repaired.root, 'manifest.json'), JSON.stringify(newer))
    await controller.initialize()
    expect(JSON.parse(await readFile(join(root, 'current.json'), 'utf8')).root).toBe(repaired.root)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('reclaims owned compact staging, preserves unrelated directories and reports the cause at the end of a traceback', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'zerowall-compact-staging-')); roots.push(userData)
    const root = join(userData, 'zerowall-python'), assets = join(userData, 'assets')
    const manifest = signedSharedManifest()
    await environment(assets, manifest)
    const interrupted = join(root, 'versions', 'i-' + 'a'.repeat(22) + '.tmp')
    const unrelated = join(root, 'versions', 'external.tmp')
    await mkdir(interrupted, { recursive: true }); await mkdir(unrelated)
    await writeFile(join(unrelated, 'keep'), 'unrelated environment')
    const bundledManifestPath = join(userData, 'base.json'), bundledArchivePath = join(userData, 'base.zip')
    await writeFile(bundledManifestPath, JSON.stringify(manifest)); await writeFile(bundledArchivePath, sharedTestArchive)
    const controller = new McpEnvironmentController({ generationMode: true, root, bundledManifestPath, bundledArchivePath,
      bundledAssets: { bioToolsRoot: join(assets, 'bio-tools'), ketcherRoot: join(assets, 'ketcher-chemistry'), sciRoot: join(assets, 'sci'), skillsRoot: join(assets, 'skills') },
      manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      healthCheck: async () => { throw new Error('Traceback:\n' + 'deep path frame\n'.repeat(100) + 'ImportError: native module failed') }, publish() {} })
    const status = await controller.initialize()
    expect(status).toMatchObject({ phase: 'failed', message: expect.stringContaining('ImportError: native module failed') })
    await expect(lstat(interrupted)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(unrelated, 'keep'), 'utf8')).toBe('unrelated environment')
    expect(await readdir(join(root, 'versions'))).toEqual(['external.tmp'])
    await expect(readFile(join(root, 'current.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('activates immutable generations, retains leased tasks and rolls back by pointer', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'zerowall-generations-')); roots.push(userData)
    const root = join(userData, 'zerowall-python'), assets = join(userData, 'assets')
    const manifest = signedSharedManifest()
    await environment(assets, manifest)
    const bundledManifestPath = join(userData, 'base.json'), bundledArchivePath = join(userData, 'base.zip')
    await writeFile(bundledArchivePath, sharedTestArchive)
    const publishManifest = async (revision: number) => {
      manifest.contentRevision = revision
      manifest.signature.value = sign(null, canonicalManifest(manifest), keys.privateKey).toString('base64')
      await writeFile(bundledManifestPath, JSON.stringify(manifest))
    }
    const controller = new McpEnvironmentController({ generationMode: true, root, bundledManifestPath, bundledArchivePath,
      bundledAssets: { bioToolsRoot: join(assets, 'bio-tools'), ketcherRoot: join(assets, 'ketcher-chemistry'), sciRoot: join(assets, 'sci'), skillsRoot: join(assets, 'skills') },
      manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), healthCheck: async () => {}, publish() {} })
    await publishManifest(1)
    const first = await controller.initialize()
    expect(first.phase).toBe('ready')
    const before = JSON.parse(await readFile(join(root, 'current.json'), 'utf8'))
    expect(before.generation).toBe(true)
    expect(first.python?.executable).toBe(join(before.root, 'Python/python.exe'))
    const bytes = await readFile(join(before.root, 'manifest.json'))
    await mkdir(join(root, 'leases'))
    await writeFile(join(root, 'leases/task.json'), JSON.stringify({ pid: process.pid, snapshot: before.root }))
    await publishManifest(2); expect((await controller.initialize()).phase).toBe('ready')
    const second = JSON.parse(await readFile(join(root, 'current.json'), 'utf8'))
    expect(second.root).not.toBe(before.root)
    await publishManifest(3); expect((await controller.initialize()).phase).toBe('ready')
    const { collectSnapshots } = await import('../src/main/python-snapshots.js')
    await collectSnapshots(root, Date.now() + 48 * 60 * 60_000)
    expect(await readFile(join(before.root, 'manifest.json'))).toEqual(bytes)
    expect((await controller.rollback()).phase).toBe('ready')
    expect(JSON.parse(await readFile(join(root, 'current.json'), 'utf8')).root).toBe(second.root)
    await expect(lstat(join(userData, 'Python'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('installs a verified bundled base without contacting the legacy network feed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-bundled-base-')); roots.push(root)
    const manifest = signedManifest()
    const bundledManifestPath = join(root, 'base.json'); const bundledArchivePath = join(root, 'base.zip')
    await writeFile(bundledManifestPath, JSON.stringify(manifest)); await writeFile(bundledArchivePath, testArchive)
    const fetcher = vi.fn(async () => { throw new Error('Network must not be used for bundled base') })
    const controller = new McpEnvironmentController({ root, bundledManifestPath, bundledArchivePath, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), fetcher, healthCheck: async () => {}, publish() {} })
    const status = await controller.initialize()
    expect(status, JSON.stringify(status)).toMatchObject({ phase: 'ready', environmentVersion: '1.0.0' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects a corrupted bundled base rather than falling back to the network', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-corrupt-base-')); roots.push(root)
    const manifest = signedManifest()
    const bundledManifestPath = join(root, 'base.json'); const bundledArchivePath = join(root, 'base.zip')
    await writeFile(bundledManifestPath, JSON.stringify(manifest)); await writeFile(bundledArchivePath, Buffer.alloc(testArchive.byteLength))
    const fetcher = vi.fn(async () => { throw new Error('No remote fallback') })
    const controller = new McpEnvironmentController({ root, bundledManifestPath, bundledArchivePath, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), fetcher, healthCheck: async () => {}, publish() {} })
    await expect(controller.initialize()).resolves.toMatchObject({ phase: 'failed', message: expect.stringContaining('SHA-256') })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('downloads a thin bootstrap into the canonical single-directory runtime', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'zerowall-python-thin-remote-')); roots.push(userData)
    const runtimeRoot = join(userData, 'Python')
    const root = join(runtimeRoot, '.zerowall')
    const manifest = signedSharedManifest()
    manifest.environmentVersion = '1.5.1'
    manifest.contentRevision = 16
    manifest.python.modules = ['pip']
    manifest.python.bootstrapOnly = true
    manifest.pythonHealth.imports = []
    manifest.archiveUrl = 'https://example.test/python/bootstrap.zip'
    manifest.archiveSha256 = createHash('sha256').update(sharedTestArchive).digest('hex')
    manifest.archiveSize = sharedTestArchive.byteLength
    manifest.signature.value = sign(null, canonicalManifest(manifest), keys.privateKey).toString('base64')
    const assets = join(userData, 'assets')
    await mkdir(join(assets, 'bio-tools'), { recursive: true })
    await mkdir(join(assets, 'ketcher-chemistry'), { recursive: true })
    await mkdir(join(assets, 'sci', 'dist'), { recursive: true })
    await mkdir(join(assets, 'skills'), { recursive: true })
    await writeFile(join(assets, 'bio-tools', 'run_server.py'), '')
    await writeFile(join(assets, 'ketcher-chemistry', 'server.js'), '')
    await writeFile(join(assets, 'sci', 'dist', 'cli.mjs'), '')
    await writeFile(join(assets, 'sci', 'dist', 'mcp.cjs'), '')
    await writeFile(join(assets, 'sci', 'zerowall-mcp-launcher.cjs'), '')
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('.zip')) return new Response(sharedTestArchive as unknown as BodyInit)
      return new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/json' } })
    })
    const controller = new McpEnvironmentController({
      root,
      runtimeRoot,
      manifestUrl: 'https://example.test/python/latest.json',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      publicKeys: { 'stable-1': keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() },
      fetcher,
      bundledAssets: { bioToolsRoot: join(assets, 'bio-tools'), ketcherRoot: join(assets, 'ketcher-chemistry'), sciRoot: join(assets, 'sci'), skillsRoot: join(assets, 'skills') },
      healthCheck: async () => undefined,
      verifySharedPython: async () => undefined,
      publish() {},
    })

    const installed = await controller.initialize()
    expect(installed, JSON.stringify(installed)).toMatchObject({ phase: 'ready', environmentVersion: '1.5.1' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(await readFile(join(runtimeRoot, 'python.exe'), 'utf8')).toBe('fixture interpreter')
    expect(await readFile(join(runtimeRoot, 'Lib', 'site-packages', '.keep'), 'utf8')).toBe('')
    const current = JSON.parse(await readFile(join(root, 'current.json'), 'utf8'))
    expect(current.root).toBe(runtimeRoot)
    expect(current.runtimeRoot).toBe(runtimeRoot)
    expect(await readdir(root)).not.toContain('slots')
    expect(await readdir(root)).not.toContain('versions')
    expect(await readdir(runtimeRoot)).not.toContain('Python')
    expect(await readdir(runtimeRoot)).not.toContain('zerowall-python')
  })

  it('recovers from a compact legacy current record whose standalone manifest is missing', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'zerowall-python-stale-current-')); roots.push(userData)
    const root = join(userData, 'zerowall-python'); const stale = join(root, 'slots', 'a')
    await mkdir(stale, { recursive: true })
    const manifest = signedSharedManifest()
    const bundledManifestPath = join(userData, 'base.json'); const bundledArchivePath = join(userData, 'base.zip')
    await writeFile(bundledManifestPath, JSON.stringify(manifest)); await writeFile(bundledArchivePath, sharedTestArchive)
    await writeFile(join(root, 'current.json'), JSON.stringify({ root: stale, slot: 'a', health: 'ready', manifest: { environmentVersion: '1.0.0', python: { relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' } }, manifestPath: 'manifest.json' }))
    const controller = new McpEnvironmentController({ root, bundledManifestPath, bundledArchivePath, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), healthCheck: async () => {}, verifySharedPython: async () => {}, publish() {} })

    const status = await controller.initialize()
    expect(status, JSON.stringify(status)).toMatchObject({ phase: 'ready', environmentVersion: '1.0.0' })
    const current = JSON.parse(await readFile(join(root, 'current.json'), 'utf8'))
    expect(current.root).not.toBe(stale)
    expect(current.root).toBe(userData)
    expect((await lstat(stale)).isDirectory()).toBe(true)
    expect(await readFile(join(userData, 'Python', 'python.exe'), 'utf8')).toBe('fixture interpreter')
    await expect(controller.localStatus()).resolves.toMatchObject({ phase: 'ready' })
  })

  it('installs the bundled shared runtime into a real stable directory on first run', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'zerowall-python-first-run-')); roots.push(userData)
    const root = join(userData, 'zerowall-python'); const manifest = signedSharedManifest()
    const bundledManifestPath = join(userData, 'base.json'); const bundledArchivePath = join(userData, 'base.zip')
    await writeFile(bundledManifestPath, JSON.stringify(manifest)); await writeFile(bundledArchivePath, sharedTestArchive)
    const controller = new McpEnvironmentController({ coordinateHost: true, root, bundledManifestPath, bundledArchivePath, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), healthCheck: async () => {}, verifySharedPython: async () => {}, publish() {} })

    await expect(controller.initialize()).resolves.toMatchObject({ phase: 'ready', environmentVersion: '1.0.0' })
    const stablePython = join(userData, 'Python')
    expect(await readFile(join(stablePython, 'python.exe'), 'utf8')).toBe('fixture interpreter')
    expect(await readFile(join(stablePython, 'Lib', 'site-packages', '.keep'), 'utf8')).toBe('')
    expect((await lstat(stablePython)).isSymbolicLink()).toBe(false)
    expect(JSON.parse(await readFile(join(root, 'current.json'), 'utf8')).runtimeRoot).toBe(userData)
    await expect(readFile(join(root, 'activation.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(root, 'activation-ready.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(root)).includes('slots')).toBe(false)
    expect((await readdir(userData)).some(name => name.startsWith('Python.installing-'))).toBe(false)
    expect((await readdir(userData)).some(name => name.startsWith('Python.migrating-'))).toBe(false)
    expect((await readdir(root)).some(name => name.startsWith('python-migration-'))).toBe(false)
  })

  it('removes a failed first-run extraction and retries at the same Python path', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'zerowall-python-first-retry-')); roots.push(userData)
    const root = join(userData, 'zerowall-python'); const manifest = signedSharedManifest()
    const bundledManifestPath = join(userData, 'base.json'); const bundledArchivePath = join(userData, 'base.zip')
    await writeFile(bundledManifestPath, JSON.stringify(manifest)); await writeFile(bundledArchivePath, sharedTestArchive)
    let failOnce = true
    const controller = new McpEnvironmentController({
      root, bundledManifestPath, bundledArchivePath, manifestUrl: 'https://example.test/latest.json',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      healthCheck: async () => { if (failOnce) { failOnce = false; throw new Error('injected Python verification failure') } },
      verifySharedPython: async () => {}, publish() {},
    })

    await expect(controller.initialize()).resolves.toMatchObject({ phase: 'failed', message: expect.stringContaining('injected Python verification failure') })
    await expect(lstat(join(userData, 'Python'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(readFile(join(root, 'current.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(controller.initialize()).resolves.toMatchObject({ phase: 'ready' })
    expect(await readFile(join(userData, 'Python', 'python.exe'), 'utf8')).toBe('fixture interpreter')
    expect((await readdir(root)).includes('slots')).toBe(false)
  })

  it('keeps an existing Python directory if bundled installation fails verification', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'zerowall-python-preserve-')); roots.push(userData)
    const root = join(userData, 'zerowall-python'); const manifest = signedSharedManifest()
    const existingPython = join(userData, 'Python')
    await mkdir(existingPython)
    await writeFile(join(existingPython, 'personal-package.txt'), 'keep this file')
    const bundledManifestPath = join(userData, 'base.json'); const bundledArchivePath = join(userData, 'base.zip')
    await writeFile(bundledManifestPath, JSON.stringify(manifest)); await writeFile(bundledArchivePath, sharedTestArchive)
    const controller = new McpEnvironmentController({
      root, bundledManifestPath, bundledArchivePath, manifestUrl: 'https://example.test/latest.json',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      healthCheck: async () => { throw new Error('injected Python verification failure') },
      verifySharedPython: async () => {}, publish() {},
    })

    await expect(controller.initialize()).resolves.toMatchObject({ phase: 'failed' })
    expect(await readFile(join(existingPython, 'personal-package.txt'), 'utf8')).toBe('keep this file')
    await expect(readFile(join(existingPython, 'python.exe'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(existingPython))).toEqual(['personal-package.txt'])
  })

  it('adopts an existing signed Python installation without replacing its files', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'zerowall-python-adopt-')); roots.push(userData)
    const root = join(userData, 'zerowall-python'); const manifest = signedSharedManifest()
    const existingPython = join(userData, 'Python')
    await mkdir(join(existingPython, 'Lib', 'site-packages'), { recursive: true })
    await writeFile(join(existingPython, 'python.exe'), 'existing interpreter')
    await writeFile(join(existingPython, 'personal-package.txt'), 'keep this file')
    await writeFile(join(userData, 'manifest.json'), JSON.stringify(manifest))
    const bundledManifestPath = join(userData, 'base.json'); const bundledArchivePath = join(userData, 'base.zip')
    await writeFile(bundledManifestPath, JSON.stringify(manifest)); await writeFile(bundledArchivePath, sharedTestArchive)
    const controller = new McpEnvironmentController({
      root, bundledManifestPath, bundledArchivePath, manifestUrl: 'https://example.test/latest.json',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      verifySharedPython: async () => {}, publish() {},
    })

    await expect(controller.initialize()).resolves.toMatchObject({ phase: 'ready', updated: false })
    expect(await readFile(join(existingPython, 'python.exe'), 'utf8')).toBe('existing interpreter')
    expect(await readFile(join(existingPython, 'personal-package.txt'), 'utf8')).toBe('keep this file')
    expect((await readdir(root)).includes('recovery')).toBe(false)
  })

  it('replaces a legacy Python layout directly from the signed bundle and keeps the old profile', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'zerowall-python-legacy-recovery-')); roots.push(userData)
    const root = join(userData, 'zerowall-python')
    const oldSlot = join(root, 'slots', 'a')
    const oldManifest = signedManifest('6.2.0', 'stable-1', '0.9.0')
    await environment(oldSlot, oldManifest)
    await writeFile(join(oldSlot, 'legacy-profile.txt'), 'preserve old profile')
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'current.json'), JSON.stringify({ root: oldSlot, health: 'ready', slot: 'a', manifest: oldManifest }))

    // Simulate the incomplete directory left by a failed earlier install.
    const publicPython = join(userData, 'Python')
    await mkdir(publicPython)
    await writeFile(join(publicPython, 'python.exe'), 'incomplete interpreter')
    await writeFile(join(publicPython, 'partial-install.txt'), 'discard only after verified replacement is ready')

    const manifest = signedSharedManifest()
    const bundledManifestPath = join(userData, 'base.json'); const bundledArchivePath = join(userData, 'base.zip')
    await writeFile(bundledManifestPath, JSON.stringify(manifest)); await writeFile(bundledArchivePath, sharedTestArchive)
    const controller = new McpEnvironmentController({
      root, bundledManifestPath, bundledArchivePath, manifestUrl: 'https://example.test/latest.json',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      healthCheck: async () => {}, verifySharedPython: async () => {}, publish() {},
    })

    await expect(controller.initialize()).resolves.toMatchObject({ phase: 'ready', environmentVersion: '1.0.0' })
    expect(await readFile(join(publicPython, 'python.exe'), 'utf8')).toBe('fixture interpreter')
    const recoveries = await readdir(join(root, 'recovery'))
    expect(recoveries).toHaveLength(1)
    expect(await readFile(join(root, 'recovery', recoveries[0]!, 'partial-install.txt'), 'utf8')).toBe('discard only after verified replacement is ready')
    expect(await readFile(join(oldSlot, 'legacy-profile.txt'), 'utf8')).toBe('preserve old profile')
    const current = JSON.parse(await readFile(join(root, 'current.json'), 'utf8'))
    expect(current.root).not.toBe(oldSlot)
    expect(current.runtimeRoot).toBe(userData)
  })

  it('treats an old profile as pending recovery instead of blocking dependency setup', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'zerowall-python-legacy-pending-')); roots.push(userData)
    const root = join(userData, 'zerowall-python')
    const oldSlot = join(root, 'slots', 'a')
    const oldManifest = signedManifest('6.2.0', 'stable-1', '0.9.0')
    await environment(oldSlot, oldManifest)
    await mkdir(root, { recursive: true })
    await writeFile(join(root, 'current.json'), JSON.stringify({ root: oldSlot, health: 'ready', slot: 'a', manifest: oldManifest }))

    const controller = new McpEnvironmentController({
      root,
      manifestUrl: 'https://example.test/latest.json',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      publish() {},
    })

    await expect(controller.localStatus()).resolves.toMatchObject({
      phase: 'checking',
      updateAvailable: true,
      updateRequired: true,
      message: expect.stringContaining('忽略旧 profile'),
    })
    expect(controller.current().lastUpdateError).toBeUndefined()
  })

  it('recognizes a committed package job after a crash before job completion was recorded', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-package-commit-')); roots.push(root)
    const installed = join(root, 'slots', 'committed')
    await mkdir(installed, { recursive: true }); await mkdir(join(root, 'plans'))
    const planId = '11111111-1111-1111-1111-111111111111'
    await writeFile(join(root, 'current.json'), JSON.stringify({ root: installed, health: 'ready' }))
    await writeFile(join(root, 'plans', `${planId}.json`), JSON.stringify({ planId, snapshotId: 'old-snapshot', changes: [] }))
    await writeFile(join(installed, 'customization.json'), JSON.stringify({ planId }))
    const controller = new McpEnvironmentController({ root, manifestUrl: 'https://fixture', publicKey: '', publish() {} })
    const inventory = { snapshotId: installed, ready: true, packages: [] }
    vi.spyOn(controller, 'pythonInfo').mockResolvedValue(inventory)
    await expect(controller.applyPackagePlan(planId)).resolves.toEqual(inventory)
    expect(JSON.parse(await readFile(join(root, 'current.json'), 'utf8')).root).toBe(installed)
  })
  it('rejects selecting a manual environment because Python is shared', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-python-rollback-')); roots.push(root)
    const selected = join(root, 'slots', 'a'), current = join(root, 'slots', 'b')
    const old = signedManifest('6.2.0', 'stable-1', '1.3.0')
    const next = signedManifest('6.2.0', 'stable-1', '1.4.0')
    await environment(selected, old); await environment(current, next)
    await writeFile(join(root, 'current.json'), JSON.stringify({ root: current, health: 'ready', manifest: next }))
    const controller = new McpEnvironmentController({ root, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), healthCheck: async () => undefined, publish: () => undefined })
    await expect(controller.selectManual(selected)).rejects.toThrow(/一套共享 Python/u)
    expect(JSON.parse(await readFile(join(root, 'current.json'), 'utf8')).manifest.environmentVersion).toBe('1.4.0')
  })
  for (const failHealth of [false, true]) {
    it(`preserves all six user extensions when a 1.4.0 upgrade ${failHealth ? 'fails health checks' : 'succeeds'}`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'zerowall-python-overlay-')); roots.push(root)
      const installed = join(root, 'slots', 'a')
      const old = signedManifest('6.2.0', 'stable-1', '1.3.0')
      const next = signedManifest('6.2.0', 'stable-1', '1.4.0')
      await environment(installed, old)
      await writeFile(join(root, 'current.json'), JSON.stringify({ root: installed, health: 'ready', slot: 'a', manifest: old }))
      const overlay = join(root, 'python-overlay', 'python-3.12')
      await mkdir(overlay, { recursive: true })
      const names = ['greenlet', 'playwright', 'pycryptodome', 'pyee', 'tomli', 'typing-extensions']
      for (const name of names) await writeFile(join(overlay, name), `existing ${name}`)
      const controller = new McpEnvironmentController({
        root, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(), publish: () => undefined,
        fetcher: async url => String(url).endsWith('latest.json') ? new Response(JSON.stringify(next)) : new Response(new Uint8Array(testArchive)),
        healthCheck: async (_root, manifest) => { if (failHealth && manifest.environmentVersion === '1.4.0') throw new Error('injected runtime health failure') },
      })
      const status = await controller.initialize()
      expect(status).toMatchObject({ phase: 'ready', environmentVersion: failHealth ? '1.3.0' : '1.4.0', currentSlot: failHealth ? 'a' : 'b' })
      for (const name of names) expect(await readFile(join(overlay, name), 'utf8')).toBe(`existing ${name}`)
      expect(await readFile(join(installed, 'manifest.json'), 'utf8')).toBe(JSON.stringify(old))
      if (failHealth) expect(status.lastUpdateError).toContain('injected runtime health failure')
      else expect(JSON.parse(await readFile(join(root, 'rollback.json'), 'utf8')).root).toBe(installed)
    })
  }
  it('keeps the durable status log compact while preserving the skill summary', () => {
    const diagnostic = mcpEnvironmentDiagnostic({
      phase: 'ready',
      environmentVersion: '1.3.0',
      skillAudit: {
        summary: { ready: 1, managed: 2, missing: 3, external: 4, incompatible: 5 },
        skills: Array.from({ length: 200 }, (_, index) => ({ name: `skill-${index}`, path: `skill-${index}`, status: 'ready' as const, detectedImports: [], requirements: [] })),
      },
    })

    expect(diagnostic).toMatchObject({ phase: 'ready', environmentVersion: '1.3.0', skillAuditSummary: { ready: 1 } })
    expect(diagnostic).not.toHaveProperty('skillAudit')
    expect(JSON.stringify(diagnostic).length).toBeLessThan(1_000)
  })

  it('extracts archives off the main thread and reports file progress', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-mcp-worker-')); roots.push(root)
    const archivePath = join(root, 'environment.zip')
    const target = join(root, 'target')
    const progress: Array<[number, number]> = []
    let eventLoopResponsive = false
    await writeFile(archivePath, testArchive)
    setTimeout(() => { eventLoopResponsive = true }, 0)

    await extractZipInWorker(archivePath, target, (completed, total) => progress.push([completed, total]))

    expect(eventLoopResponsive).toBe(true)
    expect(progress.at(-1)).toEqual([17, 17])
    await expect(readFile(join(target, 'skills', 'example', 'SKILL.md'), 'utf8')).resolves.toBe('')
  })

  it('limits Python health imports to three representative lightweight modules', () => {
    expect(selectPythonHealthImports(['httpx', 'scanpy', 'pandas', 'numpy', 'mcp', 'anndata'])).toEqual(['mcp', 'numpy', 'pandas'])
    expect(selectPythonHealthImports(['httpx'])).toEqual(['httpx'])
    expect(selectPythonHealthImports(['valid', 'bad-name'])).toEqual(['valid'])
  })

  it('rejects unknown key ids and accepts a trusted keyring entry', () => {
    const manifest = signedManifest('4.1.9', 'rotated-2')
    const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
    expect(verifyManifestWithKeyring(manifest, publicKey)).toBe(false)
    expect(verifyManifestWithKeyring(manifest, '', { 'rotated-2': publicKey })).toBe(true)
  })

  it('rejects an external environment before current.json exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-mcp-root-')); roots.push(root)
    const selected = await mkdtemp(join(tmpdir(), 'zerowall-mcp-selected-')); roots.push(selected)
    const manifest = signedManifest(); await environment(selected, manifest)
    const controller = new McpEnvironmentController({
      root, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      healthCheck: async () => undefined, publish: () => undefined,
    })
    await expect(controller.selectManual(selected)).rejects.toThrow(/一套共享 Python/u)
  })

  it('retains the current signed healthy environment when an update manifest is invalid', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-mcp-root-')); roots.push(root)
    const installed = join(root, 'versions', '4.1.9')
    const manifest = signedManifest(); await environment(installed, manifest)
    await writeFile(join(root, 'current.json'), JSON.stringify({ version: manifest.version, root: installed, health: 'ready', manifest }))
    const invalid = { ...signedManifest('4.2.0'), version: 'tampered' }
    const controller = new McpEnvironmentController({
      root, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      fetcher: async () => new Response(JSON.stringify(invalid), { status: 200 }), healthCheck: async () => undefined, publish: () => undefined,
    })
    await expect(controller.initialize()).resolves.toMatchObject({ phase: 'ready', environmentVersion: '1.0.0', message: installed })
  })

  it('reuses one healthy environment when only the desktop application version changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-mcp-root-')); roots.push(root)
    const installed = join(root, 'slots', 'a')
    const installedManifest = signedManifest('4.1.13', 'stable-1', '1.0.0', 1)
    await environment(installed, installedManifest)
    await writeFile(join(root, 'current.json'), JSON.stringify({ environmentVersion: '1.0.0', contentRevision: 1, slot: 'a', root: installed, health: 'ready', manifest: installedManifest }))
    const onlineManifest = signedManifest('4.1.14', 'stable-1', '1.0.0', 1)
    const requests: string[] = []
    const controller = new McpEnvironmentController({
      root, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      fetcher: async url => { requests.push(String(url)); return String(url).endsWith('latest.json') ? new Response(JSON.stringify(onlineManifest), { status: 200 }) : new Response(new Blob([new Uint8Array(testArchive)]), { status: 200 }) }, healthCheck: async () => undefined, publish: () => undefined,
    })
    await expect(controller.initialize()).resolves.toMatchObject({ phase: 'ready', environmentVersion: '1.0.0', currentSlot: 'a', updated: false })
    expect(requests).toEqual(['https://example.test/latest.json'])
    expect(JSON.parse(await readFile(join(root, 'current.json'), 'utf8'))).toMatchObject({ root: installed, slot: 'a' })
  })

  it('checks the online manifest without downloading and reports a required update', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-mcp-root-')); roots.push(root)
    const installed = join(root, 'slots', 'a')
    const installedManifest = signedManifest('4.1.13', 'stable-1', '1.0.0', 4)
    await environment(installed, installedManifest)
    await writeFile(join(root, 'current.json'), JSON.stringify({ environmentVersion: '1.0.0', contentRevision: 4, slot: 'a', root: installed, health: 'ready', manifest: installedManifest }))
    const onlineManifest = signedManifest('5.10.0', 'stable-1', '1.1.2', 3)
    const requests: string[] = []
    const controller = new McpEnvironmentController({
      root, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      fetcher: async url => { requests.push(String(url)); return new Response(JSON.stringify(onlineManifest), { status: 200 }) }, healthCheck: async () => undefined, publish: () => undefined,
    })
    await expect(controller.checkForUpdates()).resolves.toMatchObject({ phase: 'ready', environmentVersion: '1.0.0', contentRevision: 4, onlineEnvironmentVersion: '1.1.2', onlineContentRevision: 3, updateAvailable: true })
    expect(requests).toEqual(['https://example.test/latest.json'])
  })

  it('finishes a missing-runtime feed check idle without installing or scheduling work', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-python-check-only-')); roots.push(root)
    const manifest = signedSharedManifest()
    const requests: string[] = []
    const healthCheck = vi.fn(async () => undefined)
    const controller = new McpEnvironmentController({
      root, generationMode: true, manifestUrl: 'https://example.test/latest.json',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      fetcher: async url => { requests.push(String(url)); return new Response(JSON.stringify(manifest), { status: 200 }) },
      healthCheck, publish() {},
    })
    const status = await controller.checkForUpdates()
    expect(status).toMatchObject({ phase: 'idle', updateAvailable: true, python: { ready: false } })
    expect(status.lastCheckedAt).toBeTruthy()
    expect(status.activeEnvironment).toBeUndefined()
    expect(status.updateJob).toBeUndefined()
    expect(requests).toEqual(['https://example.test/latest.json'])
    expect(healthCheck).not.toHaveBeenCalled()
    expect(await readdir(root)).toEqual([])
  })

  it('rejects unsafe package specifications before starting pip', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-mcp-root-')); roots.push(root)
    const controller = new McpEnvironmentController({ root, manifestUrl: 'https://example.test/latest.json', publicKey: 'test', publish: () => undefined })
    await expect(controller.installPythonPackage('requests; calc.exe')).rejects.toThrow('包名格式不安全')
  })

  it('updates the inactive slot when MCP content revision changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-mcp-root-')); roots.push(root)
    const installed = join(root, 'slots', 'a')
    const installedManifest = signedManifest('4.1.13', 'stable-1', '1.0.0', 1)
    await environment(installed, installedManifest)
    await writeFile(join(root, 'current.json'), JSON.stringify({ environmentVersion: '1.0.0', contentRevision: 1, slot: 'a', root: installed, health: 'ready', manifest: installedManifest }))
    const onlineManifest = signedManifest('4.1.14', 'stable-1', '1.0.0', 2)
    const controller = new McpEnvironmentController({
      root, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      fetcher: async url => String(url).endsWith('latest.json') ? new Response(JSON.stringify(onlineManifest), { status: 200 }) : new Response(new Blob([new Uint8Array(testArchive)]), { status: 200 }), healthCheck: async () => undefined, publish: () => undefined,
    })
    await expect(controller.initialize()).resolves.toMatchObject({ phase: 'ready', currentSlot: 'b', updated: true, rollbackAvailable: true })
  })

  it('does not activate an orphan slot without validated customization and activation evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-mcp-root-')); roots.push(root)
    const installed = join(root, 'slots', 'a')
    const recovered = join(root, 'slots', 'b')
    const installedManifest = signedManifest('5.12.0', 'stable-1', '1.1.3', 1)
    const onlineManifest = signedManifest('5.13.0', 'stable-1', '1.2.0', 1)
    await environment(installed, installedManifest)
    await environment(recovered, onlineManifest)
    await writeFile(join(root, 'current.json'), JSON.stringify({ environmentVersion: '1.1.3', contentRevision: 1, slot: 'a', root: installed, health: 'ready', manifest: installedManifest }))
    const requests: string[] = []
    const controller = new McpEnvironmentController({
      root, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      fetcher: async url => { requests.push(String(url)); return new Response(JSON.stringify(onlineManifest), { status: 200 }) }, healthCheck: async () => undefined, publish: () => undefined,
    })

    await expect(controller.initialize()).resolves.toMatchObject({ phase: 'ready', environmentVersion: '1.1.3', currentSlot: 'a', updated: false })
    expect(requests[0]).toBe('https://example.test/latest.json')
    expect(JSON.parse(await readFile(join(root, 'current.json'), 'utf8'))).toMatchObject({ root: installed, slot: 'a', environmentVersion: '1.1.3' })
    expect(controller.current().lastUpdateError).toBeTruthy()
  })

  it('starts a user update immediately and preserves active progress during checks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-mcp-root-')); roots.push(root)
    const onlineManifest = signedManifest('5.13.0', 'stable-1', '1.2.0', 1)
    let releaseHealth!: () => void
    const healthGate = new Promise<void>(resolve => { releaseHealth = resolve })
    const requests: string[] = []
    const published: Array<{ phase: string; progress?: number }> = []
    const controller = new McpEnvironmentController({
      root, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      fetcher: async url => { requests.push(String(url)); return String(url).endsWith('latest.json') ? new Response(JSON.stringify(onlineManifest), { status: 200 }) : new Response(new Blob([new Uint8Array(testArchive)]), { status: 200 }) },
      healthCheck: async () => await healthGate,
      publish: status => published.push(status),
    })
    const started = controller.updateForUser()
    expect(started).not.toBeInstanceOf(Promise)
    expect(started).toMatchObject({ phase: 'checking', progress: 0 })
    const completion = controller.initialize()
    await new Promise(resolve => setTimeout(resolve, 10))
    const active = controller.current()
    await expect(controller.checkForUpdates()).resolves.toEqual(active)
    expect(requests.filter(url => url.endsWith('latest.json'))).toHaveLength(1)
    releaseHealth()
    await expect(completion).resolves.toMatchObject({ phase: 'ready', environmentVersion: '1.2.0', contentRevision: 1, updated: true })
    expect(published.some(status => status.phase === 'downloading' && (status.progress ?? 0) > 5)).toBe(true)
    expect(published.some(status => status.phase === 'installing' && (status.progress ?? 0) > 80)).toBe(true)
    expect((await import('node:fs/promises')).readdir(root).then(entries => entries.some(entry => entry.startsWith('.download-')))).resolves.toBe(false)
  })
})
