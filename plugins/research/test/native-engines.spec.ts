import { mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchStore } from '../../../store/src/index.js'
import { engineArguments, engineEnvironment, NativeEngineService } from '../src/host/native-engines.js'

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
