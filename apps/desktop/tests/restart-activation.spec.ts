import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { businessGenerationDir, readBusinessUpdateState, sealBusinessGeneration, writeBusinessUpdateState } from '@deepseek-ai/dsh-app-boot'
import { DesktopRestartActivation } from '../src/restart-activation.ts'
import { readHostRuntimeState, writeHostRuntimeState } from '../src/host-runtime.ts'

const roots: string[] = []
function journalData(bytes: string): Record<string, unknown> { return JSON.parse(bytes) as Record<string, unknown> }
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function prepared() {
  const root = await mkdtemp(join(tmpdir(), 'restart-activation-')); roots.push(root)
  const profile = join(root, 'profile')
  const original = randomUUID()
  const candidate = randomUUID()
  for (const id of [original, candidate]) {
    const directory = businessGenerationDir(profile, id)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ dependencies: {} }))
    sealBusinessGeneration(profile, id)
  }
  writeBusinessUpdateState(profile, { schemaVersion: 1, phase: 'prepared', active: original, pending: candidate })
  await writeHostRuntimeState(root, { schemaVersion: 1, active: { version: '9.1.0', path: 'bundled', verifiedAt: new Date(0).toISOString() },
    pending: { version: '9.1.1', path: '9.1.1', phase: 'staged' } })
  return { root, profile, original, candidate, activation: new DesktopRestartActivation(root, profile) }
}

async function activateHost(root: string) {
  const state = (await readHostRuntimeState(root))!
  await writeHostRuntimeState(root, { ...state, previous: state.active,
    active: { version: '9.1.1', path: '9.1.1', verifiedAt: new Date().toISOString() },
    pending: { version: '9.1.1', path: '9.1.1', phase: 'activating' } })
}

it('restores both generations after a Host or renderer failure and retains evidence', async () => {
  const { root, profile, original, candidate, activation } = await prepared()
  await activation.begin()
  activation.activateBusiness()
  await activateHost(root)
  expect(readBusinessUpdateState(profile)?.active).toBe(candidate)
  await activation.rollback('RENDERER_BOOT_FAILED')
  expect(readBusinessUpdateState(profile)).toMatchObject({ phase: 'restored', active: original, failed: candidate })
  expect(await readHostRuntimeState(root)).toMatchObject({ active: { path: 'bundled' }, lastFailure: { version: '9.1.1', code: 'RENDERER_BOOT_FAILED' } })
  expect((await readHostRuntimeState(root))?.pending).toBeUndefined()
  expect(journalData(await readFile(join(root, 'restart-transaction.json'), 'utf8')).phase).toBe('rolled-back')
})

it('recovers interruption between the two activation state writes', async () => {
  const { root, profile, original, activation } = await prepared()
  await activation.begin()
  activation.activateBusiness()
  const restarted = new DesktopRestartActivation(root, profile)
  await restarted.begin()
  expect(restarted.pending).toBe(false)
  expect(readBusinessUpdateState(profile)?.active).toBe(original)
  expect(await readHostRuntimeState(root)).toMatchObject({ active: { path: 'bundled' }, lastFailure: { code: 'HOST_STARTUP_INTERRUPTED' } })
})

it('replays a durable commit decision when power fails between confirmation writes', async () => {
  const { root, profile, candidate, activation } = await prepared()
  await activation.begin()
  activation.activateBusiness()
  await activateHost(root)
  const journal = journalData(await readFile(join(root, 'restart-transaction.json'), 'utf8'))
  const host = (await readHostRuntimeState(root))!
  const { pending: _pending, ...confirmedHost } = host
  journal.phase = 'confirming'
  journal.confirmed = { host: confirmedHost, business: { schemaVersion: 1, phase: 'verified', active: candidate } }
  await writeFile(join(root, 'restart-transaction.json'), JSON.stringify(journal))
  await writeHostRuntimeState(root, confirmedHost)
  const restarted = new DesktopRestartActivation(root, profile)
  await restarted.begin()
  expect(readBusinessUpdateState(profile)).toMatchObject({ phase: 'verified', active: candidate })
  expect(await readHostRuntimeState(root)).toMatchObject({ active: { version: '9.1.1' } })
  expect((await readHostRuntimeState(root))?.pending).toBeUndefined()
  expect(journalData(await readFile(join(root, 'restart-transaction.json'), 'utf8')).phase).toBe('confirmed')
})

it('commits only after renderer confirmation and rejects a bypassed Host candidate', async () => {
  const { root, profile, candidate, activation } = await prepared()
  await activation.begin()
  activation.activateBusiness()
  expect(() => { activation.assertRuntime({ selection: { source: 'bundled', runtimeDir: root }, ignoredExternal: 'bad signature' }) }).toThrow('Host candidate')
  await activateHost(root)
  await activation.confirm()
  expect(activation.pending).toBe(false)
  expect(readBusinessUpdateState(profile)).toMatchObject({ active: candidate, phase: 'verified' })
  expect((await readHostRuntimeState(root))?.pending).toBeUndefined()
})

it('rejects a modified business candidate before any Host starts', async () => {
  const { profile, candidate, activation } = await prepared()
  await activation.begin()
  await writeFile(join(businessGenerationDir(profile, candidate), 'package.json'), 'modified')
  expect(() => { activation.activateBusiness() }).toThrow('business candidate failed verification')
})

it('stops recovery when a state write cannot be persisted', async () => {
  const { root, activation } = await prepared()
  await activation.begin()
  await rm(join(root, 'state.json'))
  await mkdir(join(root, 'state.json'))
  await expect(activation.rollback('HOST_BOOT_FAILED')).rejects.toThrow()
  expect(journalData(await readFile(join(root, 'restart-transaction.json'), 'utf8')).phase).toBe('activating')
})
