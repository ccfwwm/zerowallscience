import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearDiscardedEnvironments, discardEnvironment } from '../src/host/discarded-environments.js'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rm: vi.fn(actual.rm) }
})

const roots: string[] = []
const id = '11111111-2222-3333-4444-555555555555'
beforeEach(() => { vi.clearAllMocks() })
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'python-discard-')); roots.push(root)
  const candidate = join(root, id)
  await mkdir(candidate)
  await writeFile(join(candidate, 'one.txt'), 'candidate')
  await writeFile(join(root, 'active.json'), 'retained pointer')
  return { root, candidate, discarded: join(root, '.discarded-' + id) }
}

it('quarantines a cancelled generation without deleting files and reclaims it under a later writer', async () => {
  const f = await fixture()
  const controller = new AbortController(); controller.abort()
  await discardEnvironment(f.candidate, controller.signal)
  expect(await readFile(join(f.discarded, 'one.txt'), 'utf8')).toBe('candidate')
  expect(rm).not.toHaveBeenCalled()
  await clearDiscardedEnvironments(f.root, new AbortController().signal)
  expect(await readdir(f.root)).toEqual(['active.json'])
  expect(await readFile(join(f.root, 'active.json'), 'utf8')).toBe('retained pointer')
})

it('joins an in-flight file removal and stops before the next file when cancellation overlaps cleanup', async () => {
  const f = await fixture()
  await writeFile(join(f.candidate, 'two.txt'), 'remaining')
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(rm).mockImplementationOnce(async (...args) => {
    entered.resolve(); await release.promise; await actual.rm(...args)
  })
  const controller = new AbortController()
  const pending = discardEnvironment(f.candidate, controller.signal)
  try {
    await entered.promise
    controller.abort()
  } finally { release.resolve(); await pending }
  expect(rm).toHaveBeenCalledTimes(1)
  expect(await readdir(f.discarded)).toHaveLength(1)
  await clearDiscardedEnvironments(f.root, new AbortController().signal)
  expect(await readdir(f.root)).toEqual(['active.json'])
})

it('unlinks a quarantined redirect without deleting its target', async () => {
  const f = await fixture()
  await symlink(f.candidate, f.discarded, process.platform === 'win32' ? 'junction' : 'dir')
  await clearDiscardedEnvironments(f.root, new AbortController().signal)
  expect(await readFile(join(f.candidate, 'one.txt'), 'utf8')).toBe('candidate')
  expect((await readdir(f.root)).sort()).toEqual([id, 'active.json'].sort())
})
