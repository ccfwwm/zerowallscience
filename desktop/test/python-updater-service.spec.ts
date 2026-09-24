import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ children: [] as any[], calls: [] as any[], held: new Set<string>(), missing: false, nextPid: 100 }))
vi.mock('node:child_process', () => ({
  fork: () => {
    const child = new EventEmitter() as any
    child.pid = ++state.nextPid; child.stderr = { resume() {} }
    child.kill = () => setTimeout(() => child.emit('exit', 1), 20)
    child.send = (message: any) => {
      if (!message.id) return
      state.calls.push(message)
      if (message.method === 'initialize' || state.held.has(message.method)) return
      queueMicrotask(() => child.emit('message', { id: message.id, result: message.method === 'pythonInfo' ? { ready: !state.missing, packages: [] } : state.missing ? { phase: 'unavailable', updateRequired: true } : { phase: 'ready', activeEnvironment: { snapshotId: 'active' }, updateAvailable: true } }))
    }
    state.children.push(child); return child
  },
  spawn: (_command: string, args: string[]) => { state.children.find(child => String(child.pid) === args[1])?.kill(); return {} },
}))
import { PythonUpdaterService } from '../src/main/python-updater-service.js'
const roots: string[] = []
afterEach(async () => { state.children.length = 0; state.calls.length = 0; state.held.clear(); state.missing = false; for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
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

it('only checks on startup when a runtime exists and an update is available', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-startup-')); roots.push(root)
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} })
  const status = await service.autoUpdate()
  expect(status.updateAvailable).toBe(true)
  expect(state.calls.map(call => call.method)).toEqual(['localStatus', 'checkForUpdates'])
  expect(await readdir(join(root, 'jobs')).catch(() => [])).toEqual([])
  service.stop()
})

it('automatically installs a missing base runtime at startup and exposes progress', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-missing-')); roots.push(root)
  state.missing = true
  const service = new PythonUpdaterService({ root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} })
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
