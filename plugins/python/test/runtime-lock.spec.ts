import { mkdtemp, mkdir, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { runtimeWriterActive } from '../src/shared/runtime-lock.js'
import { acquireRuntimeLease, acquireRuntimeWriter } from '../src/shared/runtime-leases.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() { const root = await mkdtemp(join(tmpdir(), 'python-lock-')); roots.push(root); await mkdir(join(root, '.zerowall')); return { root, lock: join(root, '.zerowall/write-lock.json') } }
it('ignores dead writer files for reading without removing them, then recovers them for an explicit install', async () => {
  const { root, lock } = await fixture()
  const bytes = JSON.stringify({ pid: 2147483647, token: 'old' }); await writeFile(lock, bytes)
  expect(runtimeWriterActive(root)).toBe(false)
  const release = await acquireRuntimeLease(root); await release()
  expect(await readFile(lock, 'utf8')).toBe(bytes)
  const writer = await acquireRuntimeWriter(root)
  expect(runtimeWriterActive(root)).toBe(true)
  await expect(acquireRuntimeLease(root)).rejects.toThrow('PYTHON_RUNTIME_UPDATING')
  await writer(); expect(runtimeWriterActive(root)).toBe(false)
})
it('protects a live writer and tolerates old damaged lock files', async () => {
  const { root, lock } = await fixture()
  await writeFile(lock, JSON.stringify({ pid: process.pid }))
  await expect(acquireRuntimeWriter(root)).rejects.toThrow('PYTHON_RUNTIME_BUSY')
  await expect(acquireRuntimeLease(root)).rejects.toThrow('PYTHON_RUNTIME_UPDATING')
  await writeFile(lock, '{'); expect(runtimeWriterActive(root)).toBe(true)
  await utimes(lock, new Date(0), new Date(0)); expect(runtimeWriterActive(root)).toBe(false)
  const release = await acquireRuntimeLease(root); await release()
  expect(await readdir(join(root, '.zerowall/leases'))).toEqual([])
})
