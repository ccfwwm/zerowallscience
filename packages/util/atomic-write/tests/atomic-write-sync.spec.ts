/** Bootstrap state commits tolerate Windows sharing violations without losing the previous journal. */
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { writeFileAtomicSync } from '../src/index.ts'

const interference = vi.hoisted(() => ({ failures: [] as string[], attempts: 0 }))
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>()
  return { ...actual, renameSync: (...args: Parameters<typeof actual.renameSync>) => {
    interference.attempts++
    const code = interference.failures.shift()
    if (code !== undefined) throw Object.assign(new Error('injected rename failure'), { code })
    actual.renameSync(...args)
  } }
})
const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  interference.failures = []; interference.attempts = 0
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'atomic-sync-')); roots.push(root)
  const path = join(root, 'state.json'); writeFileSync(path, 'old')
  return { root, path }
}
it('retries Windows EPERM, EACCES and EBUSY with the same complete temp file', () => {
  const { root, path } = fixture()
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  const wait = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out')
  interference.failures.push('EPERM', 'EACCES', 'EBUSY')
  writeFileAtomicSync(path, 'new', { mode: 0o600 })
  expect(readFileSync(path, 'utf8')).toBe('new')
  expect(wait).toHaveBeenCalledTimes(3)
  expect(interference.attempts).toBe(4)
  expect(readdirSync(root)).toEqual(['state.json'])
})
it.each(['win32', 'linux'] as const)('preserves the previous journal after a persistent failure on %s', (platform) => {
  const { root, path } = fixture()
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
  vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out')
  interference.failures.push(...Array.from({ length: 9 }, () => 'EPERM'))
  expect(() => { writeFileAtomicSync(path, 'new', { mode: 0o600 }) }).toThrow('injected')
  expect(interference.attempts).toBe(platform === 'win32' ? 9 : 1)
  expect(readFileSync(path, 'utf8')).toBe('old')
  expect(readdirSync(root)).toEqual(['state.json'])
})
