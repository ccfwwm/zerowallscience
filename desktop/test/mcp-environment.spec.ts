import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { canonicalManifest, extractZipInWorker, McpEnvironmentController, selectPythonHealthImports, type McpEnvironmentManifest, verifyManifestWithKeyring } from '../src/main/mcp-environment.js'

const roots: string[] = []
const keys = generateKeyPairSync('ed25519')
const testArchive = await new JSZip()
  .file('bio-tools/python/python.exe', '')
  .file('bio-tools/python/Lib/site-packages/.keep', '')
  .file('bio-tools/run_server.py', '')
  .file('ketcher-chemistry/server.js', '')
  .file('sci/dist/cli.mjs', '')
  .file('sci/dist/mcp.cjs', '')
  .file('skills/example/SKILL.md', '')
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

async function environment(root: string, manifest: McpEnvironmentManifest): Promise<void> {
  for (const relative of [manifest.python.relativeExecutable, 'bio-tools/run_server.py', 'ketcher-chemistry/server.js', manifest.sci.cli, manifest.sci.mcp]) {
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
    expect(progress.at(-1)).toEqual([7, 7])
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

  it('selects a signed manual environment before current.json exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zerowall-mcp-root-')); roots.push(root)
    const selected = await mkdtemp(join(tmpdir(), 'zerowall-mcp-selected-')); roots.push(selected)
    const manifest = signedManifest(); await environment(selected, manifest)
    const controller = new McpEnvironmentController({
      root, manifestUrl: 'https://example.test/latest.json', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      healthCheck: async () => undefined, publish: () => undefined,
    })
    await expect(controller.selectManual(selected)).resolves.toMatchObject({ phase: 'manual', message: selected })
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
