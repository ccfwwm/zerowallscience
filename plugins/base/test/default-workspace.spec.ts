import { mkdtemp, mkdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ensureDefaultWorkspace } from '../src/host/default-workspace.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

it('creates the default with old session history and does not duplicate a usable workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-default-')); roots.push(root)
  const create = vi.fn(async () => undefined)
  await ensureDefaultWorkspace({ list: () => [], create }, root)
  expect(create).toHaveBeenCalledWith(join(root, 'workspace'), 'default-workspace')
  expect((await stat(join(root, 'workspace'))).isDirectory()).toBe(true)
  const existing = join(root, 'existing'); await mkdir(existing)
  create.mockClear()
  await ensureDefaultWorkspace({ list: () => [{ path: existing }], create }, root)
  expect(create).not.toHaveBeenCalled()
})

it('preserves missing workspace registrations and creates a writable fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-default-')); roots.push(root)
  const list = [{ path: join(root, 'deleted-project') }]
  const create = vi.fn(async () => undefined)
  await ensureDefaultWorkspace({ list: () => list, create }, root)
  expect(create).toHaveBeenCalledOnce()
  expect(list).toEqual([{ path: join(root, 'deleted-project') }])
})
