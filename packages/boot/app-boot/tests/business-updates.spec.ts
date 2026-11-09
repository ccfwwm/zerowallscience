/** Profile business updates preserve the installation and verify activation and recovery. */
import { randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { activateBusinessUpdate, businessGenerationDependencies, businessGenerationDir, confirmBusinessUpdate,
  createRuntimeResolution, initProfile, loadProfileDirectory, readBusinessUpdateState, resolveBundleDir,
  restoreBusinessUpdate, resetBusinessUpdate, sealBusinessGeneration, writeBusinessUpdateState } from '../src/index.ts'

const roots: string[] = []
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'zerowall-update-')); roots.push(root)
  const profile = join(root, 'profile'); initProfile(profile, ['@zerowall/feature'])
  const app = join(root, 'app'); mkdirSync(app)
  const anchor = join(app, 'package.json')
  writeFileSync(anchor, JSON.stringify({ name: 'app', version: '1.0.0', dependencies: { '@zerowall/feature': '1.0.0' }, dsh: { installation: { profileOverrides: ['@zerowall/feature'] } } }))
  stage(app, '1.0.0')
  return { profile, anchor, root }
}
function stage(directory: string, version: string) {
  const pkg = join(directory, 'node_modules', '@zerowall/feature'); mkdirSync(pkg, { recursive: true })
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@zerowall/feature', version, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  writeFileSync(join(pkg, 'cordis.patch.yml'), '- insert: []\n')
  writeFileSync(join(pkg, 'index.js'), 'export const version = ' + JSON.stringify(version))
}
function generation(profile: string, version = '1.1.0') {
  const id = randomUUID(); const dir = businessGenerationDir(profile, id); mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { '@zerowall/feature': version } }))
  stage(dir, version); sealBusinessGeneration(profile, id)
  return { id, dir }
}
it('activates exact business versions across reloads without changing installation files', async () => {
  const { profile, anchor, root } = setup(); const next = generation(profile)
  const original = readFileSync(join(root, 'app/node_modules/@zerowall/feature/package.json'), 'utf8')
  writeBusinessUpdateState(profile, { schemaVersion: 1, pending: next.id, phase: 'prepared' })
  expect(resolveBundleDir('test', '@zerowall/feature', anchor, profile)).toContain(join('app', 'node_modules'))
  expect(activateBusinessUpdate(profile)).toBe(true)
  const loaded = loadProfileDirectory('test', profile, anchor)
  expect(loaded.layers[0]?.packageDir).toBe(join(next.dir, 'node_modules/@zerowall/feature'))
  const resolution = await createRuntimeResolution({ installAnchor: anchor, home: root, profile: loaded })
  expect(resolution.entries.find(entry => entry.name === '@zerowall/feature')?.version).toBe('1.1.0')
  confirmBusinessUpdate(profile, true)
  expect(activateBusinessUpdate(profile)).toBe(false)
  expect(businessGenerationDependencies(profile)).toEqual({ '@zerowall/feature': '1.1.0' })
  expect(readFileSync(join(root, 'app/node_modules/@zerowall/feature/package.json'), 'utf8')).toBe(original)
})
it('keeps a disabled business package override in the shared runtime resolution', async () => {
  const { profile, anchor, root } = setup(); const next = generation(profile)
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'profile', dsh: { profile: { bundles: [] } } }))
  writeBusinessUpdateState(profile, { schemaVersion: 1, pending: next.id, phase: 'prepared' }); activateBusinessUpdate(profile)
  const resolution = await createRuntimeResolution({ installAnchor: anchor, home: root, profile: loadProfileDirectory('test', profile, anchor) })
  expect(resolution.entries.find(entry => entry.name === '@zerowall/feature')?.packageDir).toBe(join(next.dir, 'node_modules/@zerowall/feature'))
})
it('restores the bundled baseline when candidate bytes are corrupted before activation', () => {
  const { profile, anchor } = setup(); const next = generation(profile)
  writeFileSync(join(next.dir, 'node_modules/@zerowall/feature/index.js'), 'corrupt')
  writeBusinessUpdateState(profile, { schemaVersion: 1, pending: next.id, phase: 'prepared' })
  expect(activateBusinessUpdate(profile)).toBe(true)
  expect(readBusinessUpdateState(profile)).toMatchObject({ phase: 'restored', failed: next.id })
  expect(resolveBundleDir('test', '@zerowall/feature', anchor, profile)).toContain(join('app', 'node_modules'))
})
it('recovers interrupted activation to the previous verified generation and retains a failed recovery', () => {
  const { profile } = setup(); const old = generation(profile, '1.1.0'); const next = generation(profile, '1.2.0')
  writeBusinessUpdateState(profile, { schemaVersion: 1, active: old.id, pending: next.id, phase: 'prepared' })
  activateBusinessUpdate(profile)
  activateBusinessUpdate(profile)
  expect(readBusinessUpdateState(profile)).toMatchObject({ active: old.id, failed: next.id, phase: 'restored' })
  confirmBusinessUpdate(profile, false)
  expect(readBusinessUpdateState(profile)?.phase).toBe('restore-failed')
  expect(businessGenerationDependencies(profile)).toEqual({ '@zerowall/feature': '1.1.0' })
})
it('refuses missing explicit profile overrides instead of loading a shipped version', () => {
  const { profile, anchor } = setup()
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { '@zerowall/feature': '1.2.0' } }))
  expect(() => resolveBundleDir('test', '@zerowall/feature', anchor, profile)).toThrow(/override.*missing/u)
})
it('refuses malformed journals and protected installation overrides', () => {
  const { profile, anchor } = setup()
  writeFileSync(anchor, JSON.stringify({ dsh: { installation: { profileOverrides: ['react'] } } }))
  expect(() => resolveBundleDir('test', 'react', anchor, profile)).toThrow()
  mkdirSync(join(profile, '.business-updates'), { recursive: true })
  writeFileSync(join(profile, '.business-updates/state.json'), JSON.stringify({ schemaVersion: 1, phase: 'prepared', pending: '../escape' }))
  expect(() => readBusinessUpdateState(profile)).toThrow()
  expect(() =>{  restoreBusinessUpdate(join(profile, 'missing')) }).toThrow()
})

it('archives even a malformed journal before explicit native recovery without deleting candidate evidence', () => {
  const { profile } = setup(); const next = generation(profile)
  const directory = join(profile, '.business-updates')
  const original = '{invalid journal'
  writeFileSync(join(directory, 'state.json'), original)
  resetBusinessUpdate(profile)
  expect(readBusinessUpdateState(profile)).toEqual({ schemaVersion: 1, phase: 'restored' })
  const backup = readdirSync(directory).find(name => name.startsWith('state-before-repair-'))
  expect(backup).toBeDefined()
  expect(readFileSync(join(directory, backup!), 'utf8')).toBe(original)
  expect(readFileSync(join(next.dir, 'seal.json'), 'utf8')).toContain('sha256')
})
