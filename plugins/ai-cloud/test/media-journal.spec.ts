import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MediaJobLedger } from '../src/host/media-jobs.js'
import type { ZeroWallMedia } from '../src/shared/media.js'

const faults = vi.hoisted(() => ({ codes: [] as string[], calls: 0 }))
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rename: async (...args: Parameters<typeof actual.rename>) => {
    faults.calls++
    const code = faults.codes.shift()
    if (code) throw Object.assign(new Error('fixture rename contention'), { code })
    return actual.rename(...args)
  } }
})
const roots: string[] = []
afterEach(async () => { faults.codes = []; faults.calls = 0; await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it.runIf(process.platform === 'win32')('retries transient Windows journal rename contention and preserves the old atomic record if contention persists', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'media-journal-')); roots.push(cwd)
  const root = join(cwd, 'ledger'), scope = { cwd, sessionId: 'session', projectId: 'project' }
  const ledger = new MediaJobLedger({} as ZeroWallMedia, async () => 'owner', root, { autoCollect: false })
  faults.codes = ['EPERM', 'EBUSY', 'EACCES']
  const job = await ledger.prepare(scope, { kind: 'video', prompt: '原草稿' })
  expect(faults.calls).toBe(4)
  const before = await readFile(join(root, job.id + '.json'), 'utf8')
  faults.codes = Array(8).fill('EPERM')
  await expect(ledger.prepare(scope, { kind: 'video', prompt: '不能覆盖的修改' }, job.id)).rejects.toMatchObject({ code: 'EPERM' })
  expect(await readFile(join(root, job.id + '.json'), 'utf8')).toBe(before)
  expect(await readdir(root)).toEqual([job.id + '.json'])
  await ledger.dispose()
})
