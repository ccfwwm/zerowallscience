import { EventEmitter } from 'node:events'
import { expect, it, vi } from 'vitest'
import { attachPythonBroker } from '../src/main/python-broker.js'
it('routes validated requests, preserves task IDs, rejects arbitrary methods and unregisters cleanly', async () => {
  const child = Object.assign(new EventEmitter(), { connected: true, send: vi.fn() })
  const service = { previewUninstall: vi.fn(async () => ({ planId: 'plan', changes: ['example'] })), applyPackagePlan: vi.fn(() => ({ taskId: 'task' })), taskStatus: vi.fn(async () => ({ state: 'running', progress: 40 })) }
  const dispose = attachPythonBroker(child as any, () => service as any)
  child.emit('message', { kind: 'zerowall-python-request', requestId: 'one', operation: 'preview', args: [['example'], 'uninstall'] })
  await vi.waitFor(() => expect(child.send).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'one', result: { planId: 'plan', changes: ['example'] } })))
  child.emit('message', { kind: 'zerowall-python-request', requestId: 'bad', operation: 'exec', args: [] })
  await vi.waitFor(() => expect(child.send).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'bad', error: expect.stringContaining('Unknown') })))
  child.emit('message', { kind: 'zerowall-python-request', requestId: 'apply', operation: 'apply', args: ['../escape'] })
  await vi.waitFor(() => expect(child.send).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'apply', error: expect.stringContaining('Invalid plan') })))
  expect(service.applyPackagePlan).not.toHaveBeenCalled()
  dispose(); expect(child.listenerCount('message')).toBe(0)
})
