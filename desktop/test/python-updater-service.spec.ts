import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ children: [] as any[], calls: [] as any[] }))
vi.mock('node:child_process', () => ({
  fork: () => {
    const child = new EventEmitter() as any
    child.pid = 123; child.stderr = { resume() {} }
    child.kill = () => setTimeout(() => child.emit('exit', 1), 20)
    child.send = (message: any) => {
      if (!message.id) return
      state.calls.push(message)
      if (message.method === 'initialize') return
      queueMicrotask(() => child.emit('message', { id: message.id, result: message.method === 'pythonInfo' ? { ready: true, packages: [] } : { phase: 'ready', activeEnvironment: { snapshotId: 'active' } } }))
    }
    state.children.push(child); return child
  },
  spawn: () => { state.children.at(-1)?.kill(); return {} },
}))
import { PythonUpdaterService } from '../src/main/python-updater-service.js'
const roots: string[] = []
afterEach(async () => { state.children.length = 0; state.calls.length = 0; for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
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

it('restores an unfinished task on next launch without replacing its id', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-broker-restart-')); roots.push(root)
  const options = { root, manifestUrl: 'https://fixture', publicKey: 'key', publish() {} }
  const original = new PythonUpdaterService(options)
  original.updateForUser()
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(1)
  const taskId = original.current().updateJob!.taskId
  original.stop()
  await expect.poll(async () => JSON.parse(await readFile(join(root, 'jobs', `${taskId}.json`), 'utf8')).state).toBe('queued')
  const restored = new PythonUpdaterService(options)
  await restored.autoUpdate()
  await expect.poll(() => state.calls.filter(call => call.method === 'initialize').length).toBe(2)
  expect(restored.current().updateJob!.taskId).toBe(taskId)
  const request = state.calls.at(-1)
  state.children.at(-1).emit('message', { id: request.id, result: { updated: true } })
  await expect.poll(async () => JSON.parse(await readFile(join(root, 'jobs', `${taskId}.json`), 'utf8')).state).toBe('complete')
  expect(restored.current().updated).toBe(true)
  restored.stop()
})
