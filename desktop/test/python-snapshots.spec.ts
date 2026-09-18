import { mkdtemp, mkdir, writeFile, access, rm, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { collectSnapshots } from '../src/main/python-snapshots.js'

it('retains active, rollback and live leased snapshots and only collects aged owned directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-snapshot-gc-'))
  try {
    const names = ['active', 'rollback', 'leased', 'unreferenced', 'recent']
    const paths = Object.fromEntries(names.map(name => [name, join(root, 'slots', `local-${randomUUID()}`)]))
    for (const path of Object.values(paths)) { await mkdir(path, { recursive: true }); await utimes(path, 1, 1) }
    await utimes(paths.recent!, new Date(), new Date())
    await mkdir(join(root, 'slots', 'a'), { recursive: true }); await utimes(join(root, 'slots', 'a'), 1, 1)
    await writeFile(join(root, 'current.json'), JSON.stringify({ root: paths.active }))
    await writeFile(join(root, 'rollback.json'), JSON.stringify({ root: paths.rollback }))
    await mkdir(join(root, 'leases'))
    await writeFile(join(root, 'leases', 'running.json'), JSON.stringify({ pid: process.pid, snapshot: paths.leased }))
    await collectSnapshots(root)
    await expect(access(paths.unreferenced!)).rejects.toThrow()
    for (const name of ['active', 'rollback', 'leased', 'recent']) await expect(access(paths[name]!)).resolves.toBeUndefined()
    await expect(access(join(root, 'slots', 'a'))).resolves.toBeUndefined()
  } finally { await rm(root, { recursive: true, force: true }) }
})
