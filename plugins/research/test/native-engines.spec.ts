import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { DEFAULT_REMOTE_R_MCP_URL, defaultScientificEngineConfig, discoverFijiExecutable, discoverNapariExecutable, discoverStarDistCommands, engineArguments, engineEnvironment, engineExecutable, NativeEngineService } from '../src/host/native-engines.js'
import { BrainAtlasService, atlasStatus, defaultAtlasDirectory, resolveManagedBrainPython } from '../src/host/brain-atlas.js'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'native-engine-'))
  const store = new ResearchStore(join(root, 'research.sqlite'))
  const project = store.createProject({ name: 'Images', rootPath: join(root, 'project') })
  await mkdir(project.rootPath)
  const service = new NativeEngineService(store)
  cleanups.push(async () => { service.dispose(); store.close(); await rm(root, { recursive: true, force: true }) })
  // Real process, deliberately not a GUI engine: Node rejects napari's -m option.
  vi.stubEnv('ZEROWALL_NAPARI_PYTHON', process.execPath)
  return { root, store, project, service }
}

describe('native engine lifecycle and project boundary', () => {
  it('discovers a Fiji executable from either a directory or an explicit entrypoint', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fiji-discovery-'))
    try {
      const entry = process.platform === 'win32' ? 'fiji.bat' : 'fiji'
      await writeFile(join(root, entry), process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n')
      expect(discoverFijiExecutable(root)).toBe(join(root, entry))
      expect(discoverFijiExecutable(join(root, entry))).toBe(join(root, entry))
      expect(defaultScientificEngineConfig('fiji').installDirectory).toBe('C:\\softworks\\Fiji')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('keeps an explicitly invalid Fiji path instead of silently falling back', () => {
    const explicit = 'C:\\does-not-exist\\fiji.exe'
    expect(engineExecutable('fiji', { executablePath: explicit })).toBe(explicit)
    expect(engineExecutable('napari', { pythonPath: explicit })).toBe(explicit)
  })
  it('finds napari and StarDist command entrypoints in the same Python site-packages/bin', async () => {
    const root = await mkdtemp(join(tmpdir(), 'shared-science-python-'))
    try {
      const python = join(root, 'python.exe')
      const bin = join(root, 'Lib', 'site-packages', 'bin')
      await mkdir(bin, { recursive: true })
      await writeFile(python, 'fixture')
      for (const name of ['napari.exe', 'stardist-predict2d.exe', 'stardist-predict3d.exe']) await writeFile(join(bin, name), 'fixture')
      expect(discoverNapariExecutable(python)).toBe(join(bin, 'napari.exe'))
      expect(discoverStarDistCommands(python)).toEqual({ predict2d: join(bin, 'stardist-predict2d.exe'), predict3d: join(bin, 'stardist-predict3d.exe') })
      expect(engineExecutable('napari', { pythonPath: python })).toBe(join(bin, 'napari.exe'))
      expect(engineArguments('napari', 'image.tif', join(bin, 'napari.exe'))).toEqual(['image.tif'])
      expect(engineArguments('napari', 'image.tif', python)).toEqual(['-m', 'napari', 'image.tif'])
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('reports RMCP through its endpoint instead of a local executable', async () => {
    const { service, project } = await fixture()
    expect(defaultScientificEngineConfig('remote-r').remoteEndpoint).toBe(DEFAULT_REMOTE_R_MCP_URL)
    await expect(service.probe(project.id, 'remote-r')).resolves.toMatchObject({ id: 'remote-r', path: DEFAULT_REMOTE_R_MCP_URL, status: 'unknown' })
  })
  it.runIf(process.platform === 'win32' && existsSync('C:\\softworks\\Fiji\\fiji-windows-x64.exe'))('probes the installed Fiji Java without launching the GUI', async () => {
    const { project, service } = await fixture()
    const status = await service.probe(project.id, 'fiji')
    expect(status).toMatchObject({ id: 'fiji', path: 'C:\\softworks\\Fiji\\fiji-windows-x64.exe' })
    expect(status.diagnostic).toContain('Java=')
  })
  it('replaces a competing path when project configuration changes', async () => {
    const { project, service } = await fixture()
    const first = await service.setConfig(project.id, { id: 'fiji', executablePath: 'C:\\first\\fiji.exe' })
    expect(first.executablePath).toBe('C:\\first\\fiji.exe')
    const second = await service.setConfig(project.id, { id: 'fiji', installDirectory: 'C:\\second\\Fiji' })
    expect(second.installDirectory).toBe('C:\\second\\Fiji')
    expect(second.executablePath).toBeUndefined()
    await expect(service.resolveExecutable(project.id, 'fiji')).rejects.toThrow('显式路径无效')
  })
  it('records a real spawn separately from process failure and never claims GUI readiness', async () => {
    const { store, project, service } = await fixture()
    const launched = await service.launch(project, 's1', 'napari')
    expect(launched).toMatchObject({ started: true, status: 'spawned', guiReady: 'unverified' })
    expect(launched.pid).toBeGreaterThan(0)
    await expect.poll(() => service.list(project.id)[0]?.status).toBe('failed')
    expect(service.list(project.id)[0]?.exitCode).not.toBe(0)
    expect(service.list(project.id)[0]?.diagnosticTail).toContain('bad option')
    expect(new NativeEngineService(store).list(project.id)[0]?.status).toBe('failed')
    expect(store.listRuns(project.id)).toEqual([])
  })
  it('rejects missing engines and invalid engine identifiers before launching', async () => {
    const { root, project, service } = await fixture()
    vi.stubEnv('ZEROWALL_NAPARI_PYTHON', join(root, 'missing.exe'))
    await expect(service.launch(project, 's1', 'napari')).rejects.toThrow()
    await expect(service.launch(project, 's1', 'python' as any)).rejects.toThrow('Unsupported')
    expect(service.list(project.id)).toEqual([])
  })
  it('blocks foreign assets, macros, remote paths and junction escapes', async () => {
    const { root, store, project, service } = await fixture()
    const foreign = store.createProject({ name: 'Foreign', rootPath: root })
    const outside = join(root, 'outside.tif'); await writeFile(outside, 'image fixture')
    const asset = store.createDataAsset({ projectId: foreign.id, name: 'Foreign', uri: pathToFileURL(outside).href, location: 'local', mediaType: 'image/tiff' })
    await expect(service.launch(project, 's1', 'napari', asset.id)).rejects.toThrow('active project')
    const macroPath = join(project.rootPath, 'macro.ijm'); await writeFile(macroPath, 'exit();')
    const macro = store.createDataAsset({ ...asset, projectId: project.id, uri: pathToFileURL(macroPath).href })
    await expect(service.launch(project, 's1', 'napari', macro.id)).rejects.toThrow('regular TIFF')
    const remote = store.createDataAsset({ ...asset, projectId: project.id, location: 'ssh', uri: 'ssh://server/image.tif' })
    await expect(service.launch(project, 's1', 'napari', remote.id)).rejects.toThrow('r_files')
    await symlink(root, join(project.rootPath, 'escape'), process.platform === 'win32' ? 'junction' : 'dir')
    const escape = store.createDataAsset({ ...asset, projectId: project.id, uri: pathToFileURL(join(project.rootPath, 'escape', 'outside.tif')).href })
    await expect(service.launch(project, 's1', 'napari', escape.id)).rejects.toThrow('outside')
    expect(service.list(project.id)).toEqual([])
  })
  it('leaves an interrupted observation unknown and never trusts a historical PID', async () => {
    const { store, project, service } = await fixture()
    store.recordAuditEvent(project.id, 'science-engine.lifecycle', { launchId: 'old', projectId: project.id, sessionId: 'old-session', id: 'napari', lifecycleRevision: 2, started: true, status: 'spawned', guiReady: 'unverified', pid: process.pid, path: process.execPath, createdAt: new Date().toISOString(), message: 'old' })
    expect(service.list(project.id)[0]).toMatchObject({ status: 'unobserved', guiReady: 'unverified' })
    service.dispose()
    expect(process.pid).toBeGreaterThan(0)
  })
  it('passes paths containing shell syntax as one argv entry', () => {
    const path = 'C:\\project space\\$(literal)&name.tif'
    expect(engineArguments('napari', path)).toEqual(['-m', 'napari', path])
    expect(engineArguments('fiji', path)).toEqual(['--allow-multiple', '--forbid-single-instance', path])
  })
  it.runIf(process.platform === 'win32')('sets Conda DLL paths only for the launched Python environment', async () => {
    const { root } = await fixture()
    await mkdir(join(root, 'conda-meta'))
    const originalPath = process.env.PATH
    const env = await engineEnvironment('napari', join(root, 'python.exe'))
    const key = Object.keys(env).find(key => key.toLowerCase() === 'path')!
    expect(env[key]).toContain(join(root, 'Library', 'bin'))
    expect(env.CONDA_PREFIX).toBe(root)
    expect(process.env.PATH).toBe(originalPath)
    expect(await engineEnvironment('fiji', join(root, 'fiji.exe'))).toEqual(process.env)
  })
})

/**
 * The BrainGlobe default atlas directory is proven here at the resolution and
 * guard layer only.  No atlas is downloaded and no Python is executed, so the
 * assertions cover path resolution, containment and the empty-install report;
 * the download itself and the shape/size verification after it are covered only
 * by real execution against a managed environment, which this suite does not do.
 */
describe('managed BrainGlobe atlas resolution', () => {
  const previousRoot = process.env.ZEROWALL_PYTHON_ROOT
  const previousAtlas = process.env.ZEROWALL_BRAINGLOBE_DIR
  const previousManaged = process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
  afterEach(() => {
    if (previousRoot === undefined) delete process.env.ZEROWALL_PYTHON_ROOT
    else process.env.ZEROWALL_PYTHON_ROOT = previousRoot
    if (previousAtlas === undefined) delete process.env.ZEROWALL_BRAINGLOBE_DIR
    else process.env.ZEROWALL_BRAINGLOBE_DIR = previousAtlas
    if (previousManaged === undefined) delete process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
    else process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT = previousManaged
  })
  async function managedRoot(): Promise<string> {
    const store = await mkdtemp(join(tmpdir(), 'zerowall-brain-managed-'))
    const installed = join(store, 'versions', '7.0.2')
    const sitePackages = join(installed, 'bio-tools', 'python', 'Lib', 'site-packages')
    await mkdir(sitePackages, { recursive: true })
    await writeFile(join(installed, 'bio-tools', 'python', 'python.exe'), 'fixture')
    const manifest = { python: { version: '3.12.8', relativeExecutable: 'bio-tools/python/python.exe', relativeSitePackages: 'bio-tools/python/Lib/site-packages' } }
    await writeFile(join(store, 'current.json'), JSON.stringify({ root: installed, health: 'ready', manifest }))
    cleanups.push(async () => rm(store, { recursive: true, force: true }))
    return store
  }
  it('resolves the managed interpreter and a default atlas directory without ZEROWALL_BRAINGLOBE_DIR', async () => {
    const store = await managedRoot()
    delete process.env.ZEROWALL_BRAINGLOBE_DIR
    delete process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
    vi.stubEnv('ZEROWALL_PYTHON_ROOT', store)
    expect(defaultAtlasDirectory()).toBe(join(store, 'brainglobe-managed'))
    const resolved = await resolveManagedBrainPython()
    expect(resolved).toMatchObject({ root: join(store, 'versions', '7.0.2'), executable: join(store, 'versions', '7.0.2', 'bio-tools', 'python', 'python.exe') })
    // The service must create the default directory lazily instead of throwing.
    const service = new BrainAtlasService(new ResearchStore(':memory:'))
    await expect((service as unknown as { atlasDirectory(purpose: string): Promise<string> }).atlasDirectory('BrainGlobe analysis')).resolves.toBe(join(store, 'brainglobe-managed'))
    await service.dispose()
  })
  it('uses runtimeRoot for the stable Python layout after migration', async () => {
    const userData = await mkdtemp(join(tmpdir(), 'zerowall-stable-science-'))
    const manager = join(userData, 'zerowall-python')
    const python = join(userData, 'Python', 'python.exe')
    const sitePackages = join(userData, 'Python', 'Lib', 'site-packages')
    await mkdir(manager, { recursive: true }); await mkdir(sitePackages, { recursive: true })
    await writeFile(python, 'fixture')
    await writeFile(join(manager, 'current.json'), JSON.stringify({ root: join(manager, 'slots', 'stale'), runtimeRoot: userData, overlayPath: sitePackages, health: 'ready', manifest: { python: { version: '3.12.10', relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' } } }))
    cleanups.push(() => rm(userData, { recursive: true, force: true }))
    vi.stubEnv('ZEROWALL_PYTHON_ROOT', manager)
    expect(await resolveManagedBrainPython()).toMatchObject({ executable: python, root: join(userData, 'Python'), sitePackages, overlayPath: sitePackages })
    expect(defaultScientificEngineConfig('napari').pythonPath).toBe(python)
    expect(defaultScientificEngineConfig('brain-globe').pythonPath).toBe(python)
    expect(defaultScientificEngineConfig('he-python').pythonPath).toBe(python)
    expect(defaultScientificEngineConfig('he-stardist').pythonPath).toBe(python)
  })
  it('reports an installed atlas only from a non-empty volume, never from a manifest alone', async () => {
    const store = await managedRoot()
    delete process.env.ZEROWALL_BRAINGLOBE_DIR
    vi.stubEnv('ZEROWALL_PYTHON_ROOT', store)
    const directory = join(store, 'brainglobe-managed')
    // A manifest with no annotation volume must not be reported as installed.
    await mkdir(join(directory, 'allen_mouse_25um'), { recursive: true })
    await writeFile(join(directory, 'allen_mouse_25um', 'zerowall-atlas.json'), JSON.stringify({ format: 'zerowall-managed-atlas', atlas: 'allen_mouse_25um', annotationFile: 'annotation.tiff', shape: [528, 320, 456] }))
    await expect(atlasStatus(directory)).resolves.toMatchObject({ installed: false, name: 'allen_mouse_25um' })
    await writeFile(join(directory, 'allen_mouse_25um', 'annotation.tiff'), Buffer.from([1, 2, 3, 4]))
    await expect(atlasStatus(directory)).resolves.toMatchObject({ installed: true, shape: [528, 320, 456] })
  })
  it('refuses an interpreter that escapes the managed install root', async () => {
    const store = await managedRoot()
    delete process.env.ZEROWALL_BRAINGLOBE_DIR
    vi.stubEnv('ZEROWALL_PYTHON_ROOT', store)
    const installed = join(store, 'versions', '7.0.2')
    await writeFile(join(store, 'current.json'), JSON.stringify({ root: installed, health: 'ready', manifest: { python: { relativeExecutable: '../../escape.exe', relativeSitePackages: 'bio-tools/python/Lib/site-packages' } } }))
    await expect(resolveManagedBrainPython()).resolves.toBeUndefined()
  })
  it('still reports the explicit requirement when no managed root exists at all', async () => {
    delete process.env.ZEROWALL_PYTHON_ROOT
    delete process.env.ZEROWALL_MCP_ENVIRONMENT_ROOT
    delete process.env.ZEROWALL_BRAINGLOBE_DIR
    expect(defaultAtlasDirectory()).toBeUndefined()
    const store = new ResearchStore(':memory:')
    const service = new BrainAtlasService(store)
    await expect((service as unknown as { atlasDirectory(purpose: string): Promise<string> }).atlasDirectory('BrainGlobe analysis')).rejects.toThrow('ZEROWALL_BRAINGLOBE_DIR is required')
    await service.dispose(); store.close()
  })
})
