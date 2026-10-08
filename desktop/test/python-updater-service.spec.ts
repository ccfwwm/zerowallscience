import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ children: [] as any[], calls: [] as any[], forks: [] as any[], held: new Set<string>(), missing: false, coreIncomplete: false, nextPid: 100 }))
vi.mock('node:child_process', () => ({
  fork: (...args: any[]) => {
    state.forks.push(args)
    const child = new EventEmitter() as any
    child.pid = ++state.nextPid; child.stderr = { resume() {} }
    child.kill = () => setTimeout(() => child.emit('exit', 1), 20)
    child.send = (message: any) => {
      if (!message.id) return
      state.calls.push(message)
      if (message.method === 'initialize' || state.held.has(message.method)) return
      queueMicrotask(() => child.emit('message', { id: message.id, result: message.method === 'pythonInfo' ? { ready: !state.missing, coreReady: !state.coreIncomplete, packages: [] } : state.missing ? { phase: 'unavailable', updateRequired: true } : { phase: 'ready', activeEnvironment: { snapshotId: 'active' }, updateAvailable: true } }))
    }
    state.children.push(child); return child
  },
  spawn: (_command: string, args: string[]) => { state.children.find(child => String(child.pid) === args[1])?.kill(); return {} },
}))
import { PythonUpdaterService } from '../src/main/python-updater-service.js'
const roots: string[] = []
afterEach(async () => { state.children.length = 0; state.calls.length = 0; state.forks.length = 0; state.held.clear(); state.missing = false; state.coreIncomplete = false; for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

it('adds packaged updater modules to the child lookup path and preserves existing Node paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-module-path-')); roots.push(root)
  const previousNodePath = process.env.NODE_PATH
  const existingNodePath = join(root, 'existing-modules')
  process.env.NODE_PATH = existingNodePath
  try {
    const updaterWorkerPath = join(root, 'resources', 'python-updater', 'python-updater-worker.js')
    const service = new PythonUpdaterService({ root, updaterWorkerPath, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} })
    await expect(service.pythonInfo()).resolves.toMatchObject({ ready: true })
    expect(state.forks).toHaveLength(1)
    expect(state.forks[0][2].env.NODE_PATH).toBe([join(dirname(updaterWorkerPath), 'modules'), existingNodePath].join(delimiter))
    service.stop()
  } finally {
    if (previousNodePath === undefined) delete process.env.NODE_PATH
    else process.env.NODE_PATH = previousNodePath
  }
})

it('continues an immediately paused job under the same durable task id', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-')); roots.push(root)
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} })
  service.updateForUser()
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(1)
  const firstId = service.current().updateJob!.taskId
  service.pause(); service.updateForUser()
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(2)
  expect(service.current().updateJob!.taskId).toBe(firstId)
  const request = state.calls.filter(call => call.method === 'initialize').at(-1)
  state.children.at(-1).emit('message', { id: request.id, result: { updated: false } })
  await expect.poll(async () => JSON.parse(await readFile(join(root, 'jobs', `${firstId}.json`), 'utf8')).state).toBe('complete')
  expect(await readdir(join(root, 'jobs'))).toEqual([`${firstId}.json`])
  expect(service.current().updated).toBe(false)
  service.stop()
})

it('leaves an unfinished task paused on launch and resumes only after a user action without replacing its id', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-restart-')); roots.push(root)
  const options = { root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} }
  const original = new PythonUpdaterService(options)
  original.updateForUser()
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(1)
  const taskId = original.current().updateJob!.taskId
  original.stop()
  await expect.poll(async () => JSON.parse(await readFile(join(root, 'jobs', `${taskId}.json`), 'utf8')).state).toBe('paused')
  const restored = new PythonUpdaterService(options)
  await restored.autoUpdate()
  expect(restored.current().phase).toBe('paused')
  expect(state.calls.filter(call => call.method === 'initialize')).toHaveLength(1)
  await restored.autoUpdate()
  expect(state.calls.filter(call => call.method === 'initialize')).toHaveLength(1)
  restored.updateForUser()
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(2)
  expect(restored.current().updateJob!.taskId).toBe(taskId)
  const request = state.calls.at(-1)
  state.children.at(-1).emit('message', { id: request.id, result: { updated: true } })
  await expect.poll(async () => JSON.parse(await readFile(join(root, 'jobs', `${taskId}.json`), 'utf8')).state).toBe('complete')
  expect(restored.current().updated).toBe(true)
  restored.stop()
})

it('does not reject new inventory calls or publish stale status when a paused worker exits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-race-')); roots.push(root)
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} })
  service.updateForUser()
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(1)
  const oldChild = state.children.at(-1)
  const taskId = service.current().updateJob!.taskId
  service.pause()
  state.held.add('pythonInfo')
  const inventory = service.pythonInfo()
  const newChild = state.children.at(-1)
  expect(newChild).not.toBe(oldChild)
  const inventoryRequest = state.calls.at(-1)
  oldChild.emit('message', { type: 'status', status: { phase: 'installing', progress: 88 } })
  expect(service.current().phase).toBe('paused')
  oldChild.emit('exit', 1)
  newChild.emit('message', { id: inventoryRequest.id, result: { ready: true, packages: [] } })
  await expect(inventory).resolves.toEqual({ ready: true, packages: [] })
  await expect.poll(async () => JSON.parse(await readFile(join(root, 'jobs', `${taskId}.json`), 'utf8')).state).toBe('paused')
  expect(state.calls.filter(call => call.method === 'initialize')).toHaveLength(1)
  service.stop()
})

it('cancels a pending resume when the user pauses again before the worker exits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-repause-')); roots.push(root)
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} })
  service.updateForUser()
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(1)
  const taskId = service.current().updateJob!.taskId
  service.pause(); service.updateForUser(); service.pause()
  await expect.poll(async () => JSON.parse(await readFile(join(root, 'jobs', `${taskId}.json`), 'utf8')).state).toBe('paused')
  expect(state.calls.filter(call => call.method === 'initialize')).toHaveLength(1)
  expect(service.current().phase).toBe('paused')
  service.stop()
})

it('returns local startup readiness immediately and leaves runtime-feed checks separate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-startup-')); roots.push(root)
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} })
  const status = await service.autoUpdate()
  expect(status.updateAvailable).toBe(true)
  expect(state.calls.map(call => call.method)).toEqual(['localStatus'])
  await expect(service.checkForUpdates()).resolves.toMatchObject({ updateAvailable: true })
  expect(state.calls.map(call => call.method)).toEqual(['localStatus', 'checkForUpdates'])
  expect(await readdir(join(root, 'jobs')).catch(() => [])).toEqual([])
  service.stop()
})

it('automatically installs a missing base runtime at startup and exposes progress', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-missing-')); roots.push(root)
  state.missing = true
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', bundledArchivePath: 'signed-offline-fixture.zip', publish() {} })
  const completion = service.autoUpdate()
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(1)
  const request = state.calls.find(call => call.method === 'initialize')!
  const worker = state.children.at(-1)
  worker.emit('message', { type: 'status', status: { phase: 'installing', progress: 47, message: '正在解压 Python', updateJob: { taskId: 'base-install', kind: 'initialize', stage: 'installing', canPause: true } } })
  expect(service.current()).toMatchObject({ phase: 'installing', progress: 47, message: '正在解压 Python' })
  state.missing = false
  worker.emit('message', { id: request.id, result: { updated: true } })
  await expect(completion).resolves.toMatchObject({ phase: 'ready', activeEnvironment: { snapshotId: 'active' } })
  expect(state.calls.map(call => call.method)).toEqual(['localStatus', 'initialize', 'pythonInfo', 'localStatus'])
  expect(JSON.parse(await readFile(join(root, 'jobs', `${service.current().updateJob!.taskId}.json`), 'utf8')).state).toBe('complete')
  service.stop()
})

it('does not reinstall the Python runtime just because its core dependency closure is incomplete', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-core-repair-')); roots.push(root)
  state.coreIncomplete = true
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', bundledArchivePath: 'signed-offline-fixture.zip', publish() {} })
  await expect(service.autoUpdate()).resolves.toMatchObject({ phase: 'ready' })
  expect(state.calls.map(call => call.method)).toEqual(['localStatus'])
  expect(state.calls.some(call => call.method === 'initialize')).toBe(false)
  service.stop()
})

it('restarts a missing bundled runtime before resuming stale dependency jobs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-stale-jobs-')); roots.push(root)
  const jobs = join(root, 'jobs')
  await mkdir(jobs)
  const bootstrapId = '11111111-1111-4111-8111-111111111111'
  const dependencyId = '22222222-2222-4222-8222-222222222222'
  await writeFile(join(jobs, `${bootstrapId}.json`), JSON.stringify({ taskId: bootstrapId, method: 'initialize', args: [], state: 'paused', updatedAt: 1 }))
  await writeFile(join(jobs, `${dependencyId}.json`), JSON.stringify({ taskId: dependencyId, method: 'installPythonPackage', args: ['requests'], state: 'paused', updatedAt: 2 }))
  state.missing = true
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', bundledArchivePath: 'signed-offline-fixture.zip', publish() {} })

  const completion = service.autoUpdate()
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(1)
  expect(state.calls.some(call => call.method === 'installPythonPackage')).toBe(false)
  expect(service.current().phase).not.toBe('paused')
  const request = state.calls.find(call => call.method === 'initialize')!
  state.missing = false
  state.children.at(-1).emit('message', { id: request.id, result: { updated: true } })
  await expect(completion).resolves.toMatchObject({ phase: 'ready' })
  expect(JSON.parse(await readFile(join(jobs, `${dependencyId}.json`), 'utf8')).state).toBe('paused')
  service.stop()
})

it('gates direct package operations behind the signed base runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-package-gate-')); roots.push(root)
  state.missing = true
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} })
  const preview = service.previewPackages(['requests'])
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(1)
  expect(state.calls.some(call => call.method === 'previewPackages')).toBe(false)
  state.missing = false
  const initialize = state.calls.find(call => call.method === 'initialize')!
  state.children.at(-1).emit('message', { id: initialize.id, result: { updated: true } })
  await expect(preview).resolves.toMatchObject({ phase: 'ready' })
  expect(state.calls.map(call => call.method)).toEqual(['localStatus', 'initialize', 'pythonInfo', 'localStatus', 'previewPackages'])
  service.stop()
})

it('does not pass package requests through when signed runtime initialization fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-package-failure-')); roots.push(root)
  state.missing = true
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} })
  const preview = service.previewPackages(['requests'])
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(1)
  const initialize = state.calls.find(call => call.method === 'initialize')!
  state.children.at(-1).emit('message', { id: initialize.id, error: '基础 Python 安装失败' })
  await expect(preview).rejects.toThrow('基础 Python 安装失败')
  expect(state.calls.some(call => call.method === 'previewPackages')).toBe(false)
  service.stop()
})

it('records an explicitly requested unavailable environment as a failed durable install', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-unavailable-')); roots.push(root)
  state.missing = true
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} })
  const completion = service.ensureReady()
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(1)
  const request = state.calls.find(call => call.method === 'initialize')!
  state.children.at(-1).emit('message', { id: request.id, result: { phase: 'failed', message: 'base archive rejected' } })
  await expect(completion).resolves.toMatchObject({ phase: 'unavailable', updateJob: { stage: 'failed' } })
  const taskId = service.current().updateJob!.taskId
  expect(JSON.parse(await readFile(join(root, 'jobs', `${taskId}.json`), 'utf8')).state).toBe('failed')
  service.stop()
})

it('automatically installs a missing thin Python runtime at startup', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-thin-')); roots.push(root)
  state.missing = true
  state.held.add('initialize')
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} })
  const completion = service.autoUpdate()
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(1)
  const request = state.calls.find(call => call.method === 'initialize')!
  expect(service.current()).toMatchObject({ phase: 'checking', updateJob: { kind: 'initialize' } })
  state.missing = false
  state.children.at(-1).emit('message', { id: request.id, result: { updated: true } })
  await expect(completion).resolves.toMatchObject({ phase: 'ready' })
  expect(state.calls.map(call => call.method)).toEqual(['localStatus', 'initialize', 'pythonInfo', 'localStatus'])
  expect(JSON.parse(await readFile(join(root, 'jobs', `${service.current().updateJob!.taskId}.json`), 'utf8')).state).toBe('complete')
  service.stop()
})

it('automatically resumes an interrupted thin bootstrap before core dependency work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-thin-paused-')); roots.push(root)
  const jobs = join(root, 'jobs'); await mkdir(jobs)
  const taskId = '33333333-3333-4333-8333-333333333333'
  await writeFile(join(jobs, `${taskId}.json`), JSON.stringify({ taskId, method: 'initialize', args: [], state: 'paused', updatedAt: 1 }))
  state.missing = true
  state.held.add('initialize')
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} })
  const completion = service.autoUpdate()
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(1)
  const request = state.calls.find(call => call.method === 'initialize')!
  expect(service.current()).toMatchObject({ phase: 'checking', updateJob: { taskId, kind: 'initialize' } })
  state.missing = false
  state.children.at(-1).emit('message', { id: request.id, result: { updated: true } })
  await expect(completion).resolves.toMatchObject({ phase: 'ready' })
  expect(JSON.parse(await readFile(join(jobs, `${taskId}.json`), 'utf8')).state).toBe('complete')
  service.stop()
})

it('resumes only the interrupted worker transaction owned by automatic core sync', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-core-resume-')); roots.push(root)
  const jobs = join(root, 'jobs'); await mkdir(jobs)
  const coreTask = '44444444-4444-4444-8444-444444444444'
  const unrelatedTask = '55555555-5555-4555-8555-555555555555'
  await writeFile(join(jobs, `${coreTask}.json`), JSON.stringify({ taskId: coreTask, method: 'applyPackagePlan', args: ['core-plan'], state: 'paused', updatedAt: 1 }))
  await writeFile(join(jobs, `${unrelatedTask}.json`), JSON.stringify({ taskId: unrelatedTask, method: 'installPythonPackage', args: ['user-package'], state: 'paused', updatedAt: 2 }))
  state.held.add('applyPackagePlan')
  state.held.add('installPythonPackage')
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} })
  await expect(service.autoUpdate()).resolves.toMatchObject({ phase: 'paused' })
  expect(service.resumeAutomaticCoreOperation(coreTask)).toBe(true)
  await expect.poll(() => state.calls.filter(call => call.method === 'applyPackagePlan').length).toBe(1)
  expect(service.resumeAutomaticCoreOperation(unrelatedTask)).toBe(false)
  expect(state.calls.some(call => call.method === 'installPythonPackage')).toBe(false)
  service.stop()
})
