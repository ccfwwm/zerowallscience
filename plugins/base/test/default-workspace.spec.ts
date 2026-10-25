import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ensureDefaultWorkspace } from '../src/host/default-workspace.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

it('restores the fixed default even when another usable history workspace exists', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-default-')); roots.push(root)
  const create = vi.fn(async () => undefined)
  await ensureDefaultWorkspace({ list: () => [], create }, root)
  expect(create).toHaveBeenCalledWith(join(root, 'workspace'), 'default-workspace')
  expect((await stat(join(root, 'workspace'))).isDirectory()).toBe(true)
  const existing = join(root, 'existing'); await mkdir(existing)
  create.mockClear()
  await ensureDefaultWorkspace({ list: () => [{ path: existing }], create }, root)
  expect(create).toHaveBeenCalledExactlyOnceWith(join(root, 'workspace'), 'default-workspace')
})

it('preserves missing workspace registrations and creates a writable fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-default-')); roots.push(root)
  const list = [{ path: join(root, 'deleted-project') }]
  const create = vi.fn(async () => undefined)
  await ensureDefaultWorkspace({ list: () => list, create }, root)
  expect(create).toHaveBeenCalledOnce()
  expect(list).toEqual([{ path: join(root, 'deleted-project') }])
})

it('does not list or probe unavailable WSL and network history paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-default-')); roots.push(root)
  const list = vi.fn(() => { throw new Error('historical path discovery must not run here') })
  const create = vi.fn(async () => undefined)
  await ensureDefaultWorkspace({ list, create }, root)
  expect(list).not.toHaveBeenCalled()
  expect(create).toHaveBeenCalledExactlyOnceWith(join(root, 'workspace'), 'default-workspace')
})

it('reuses the fixed root on every startup without deleting its existing files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-default-')); roots.push(root)
  const create = vi.fn(async () => undefined)
  const registry = { list: () => [{ path: join(root, 'workspace') }], create }
  await ensureDefaultWorkspace(registry, root)
  const retained = join(root, 'workspace', 'retained.txt')
  await writeFile(retained, 'existing workspace content')
  await ensureDefaultWorkspace(registry, root)
  expect(create.mock.calls).toEqual([
    [join(root, 'workspace'), 'default-workspace'],
    [join(root, 'workspace'), 'default-workspace'],
  ])
  expect((await stat(join(root, 'workspace'))).isDirectory()).toBe(true)
  expect(await readFile(retained, 'utf8')).toBe('existing workspace content')
})
