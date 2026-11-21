/** Renderer confirmation keeps the business journal intact through Windows file sharing interference. */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { confirmBusinessUpdate, readBusinessUpdateState, writeBusinessUpdateState } from '../src/business-updates.ts'

const io = vi.hoisted(() => ({ blocked: 0, attempts: 0 }))
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>()
  return { ...actual, renameSync: (...args: Parameters<typeof actual.renameSync>) => {
    io.attempts++
    if (io.blocked-- > 0) throw Object.assign(new Error('sharing violation'), { code: 'EPERM' })
    actual.renameSync(...args)
  } }
})
const roots: string[] = []
afterEach(() => {
  vi.restoreAllMocks(); io.blocked = 0; io.attempts = 0
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const profile = mkdtempSync(join(tmpdir(), 'business-journal-')); roots.push(profile)
  writeBusinessUpdateState(profile, { schemaVersion: 1, active: '12345678-1234-1234-1234-123456789abc', phase: 'activating' })
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out')
  io.attempts = 0
  return profile
}
it('finishes boot confirmation after a temporary EPERM and does not rewrite a confirmed journal', () => {
  const profile = fixture()
  io.blocked = 3
  confirmBusinessUpdate(profile, true)
  expect(readBusinessUpdateState(profile)?.phase).toBe('verified')
  expect(io.attempts).toBe(4)
  confirmBusinessUpdate(profile, true)
  expect(io.attempts).toBe(4)
  expect(readdirSync(join(profile, '.business-updates'))).toEqual(['state.json'])
})
it('retains an unconfirmed journal after a persistent EPERM so confirmation can retry', () => {
  const profile = fixture()
  const file = join(profile, '.business-updates/state.json')
  const before = readFileSync(file)
  io.blocked = 9
  expect(() => { confirmBusinessUpdate(profile, true) }).toThrow('sharing violation')
  expect(readFileSync(file)).toEqual(before)
  expect(readdirSync(join(profile, '.business-updates'))).toEqual(['state.json'])
  io.blocked = 0
  confirmBusinessUpdate(profile, true)
  expect(readBusinessUpdateState(profile)?.phase).toBe('verified')
})
