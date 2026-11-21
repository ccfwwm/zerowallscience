import { Context } from '@deepseek-ai/cordis'
import { EventEmitter } from 'node:events'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { spawn } from 'node:child_process'
import { afterEach, expect, it, vi } from 'vitest'
import { ZeroWallPythonService } from '../src/host/index.js'
import { PythonManagement } from '../src/host/management.js'
import { UvRuntime } from '../src/host/uv-runtime.js'

vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawn: vi.fn() }))
const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  vi.restoreAllMocks()
  vi.mocked(spawn).mockReset()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'python-automatic-')); roots.push(root)
  const paths = { root, executable: join(root, 'python'), sitePackages: root, snapshotRoot: root }
  vi.spyOn(UvRuntime.prototype, 'prepare').mockResolvedValue(paths)
  await cp(new URL('../resources/runtime/skill-capabilities.json', import.meta.url), join(root, 'skill-capabilities.json'))
  const ctx = new Context(); contexts.push(ctx)
  const management = new PythonManagement(ctx, { environmentRoot: root, assetsRoot: root, indexUrl: 'https://pypi.org/simple/', timeoutMs: 1000 })
  await management.ready()
  const python = new ZeroWallPythonService(ctx, management)
  return { paths, management, python }
}

it('prepares declared report dependencies before starting Python and exposes completion', async () => {
  const f = await fixture()
  const ensure = vi.spyOn(UvRuntime.prototype, 'ensureCapability').mockResolvedValue(f.paths)
  vi.mocked(spawn).mockImplementation(() => {
    expect(ensure).toHaveBeenCalledWith('skill-integrity-report', ['python-docx==1.2.0', 'Pillow'])
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() })
    queueMicrotask(() => { child.stdout.end('report ready'); child.stderr.end(); child.emit('close', 0) })
    return child as never
  })
  expect(await f.python.run({ code: 'import docx', description: 'Export report', capability_id: 'skill-integrity-report' }, { signal: new AbortController().signal }))
    .toMatchObject({ exitCode: 0, stdout: 'report ready' })
  expect((await f.management.request({ action: 'status', requestId: 'complete' })).task).toMatchObject({ state: 'succeeded', capabilityId: 'skill-integrity-report' })
})

it('reports preparation failure without executing Python and permits retry', async () => {
  const f = await fixture()
  const ensure = vi.spyOn(UvRuntime.prototype, 'ensureCapability').mockRejectedValueOnce(new Error('Package index unavailable')).mockResolvedValue(f.paths)
  await expect(f.management.ensureCapability('skill-integrity-report')).rejects.toThrow('Package index unavailable')
  expect((await f.management.request({ action: 'status', requestId: 'failed' })).task).toMatchObject({ state: 'failed', message: 'Package index unavailable' })
  expect(spawn).not.toHaveBeenCalled()
  await expect(f.management.ensureCapability('skill-integrity-report')).resolves.toEqual(f.paths)
  expect(ensure).toHaveBeenCalledTimes(2)
})

it('joins concurrent preparation and cancels a waiting execution without cancelling another consumer', async () => {
  const f = await fixture()
  let finish!: (paths: typeof f.paths) => void
  const ensure = vi.spyOn(UvRuntime.prototype, 'ensureCapability').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const signal = new AbortController()
  const execution = f.python.run({ code: 'import docx', description: 'Export', capability_id: 'skill-integrity-report' }, { signal: signal.signal })
  const failed = expect(execution).rejects.toThrow('Cancelled')
  const joined = f.management.ensureCapability('skill-integrity-report')
  await vi.waitFor(() => { expect(ensure).toHaveBeenCalledOnce() })
  signal.abort(new Error('Cancelled'))
  await failed
  expect(spawn).not.toHaveBeenCalled()
  finish(f.paths)
  await expect(joined).resolves.toEqual(f.paths)
})

it('rejects an unknown dependency identifier before installing or executing', async () => {
  const f = await fixture()
  const ensure = vi.spyOn(UvRuntime.prototype, 'ensureCapability')
  await expect(f.python.run({ code: 'print(1)', description: 'Probe', capability_id: 'not-a-published-capability' }, { signal: new AbortController().signal })).rejects.toThrow('Unknown Python skill capability')
  expect(ensure).not.toHaveBeenCalled()
  expect(spawn).not.toHaveBeenCalled()
})
