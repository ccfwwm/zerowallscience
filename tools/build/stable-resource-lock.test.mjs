import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { buildStableResourceLock, stableResourceLockPath, verifyStableResourceLock, writeStableResourceLock } from './stable-resource-lock.mjs'
import { includePackagedSkillPath, resourceTreeFiles } from './resource-tree.mjs'

const digest = value => createHash('sha256').update(value).digest('hex')

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zws-stable-resource-lock-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const directory of ['config/build', 'config/catalogs', 'plugins/alpha', 'plugins/support-fixture', 'resources/extensions/skills/alpha', 'resources/extensions/skills/beta']) {
    await mkdir(join(root, directory), { recursive: true })
  }
  const stable = JSON.parse(await readFile(new URL('../../config/build/stable.json', import.meta.url), 'utf8'))
  await writeFile(join(root, 'config/build/stable.json'), JSON.stringify(stable))
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '8.4.18' }))
  await writeFile(join(root, 'config/catalogs/retired-plugins.json'), JSON.stringify({ plugins: [] }))
  await writeFile(join(root, 'config/catalogs/resource-versions.json'), JSON.stringify({ skill: { alpha: '1.0.0', beta: '1.0.0' } }))
  await writeFile(join(root, 'plugins/alpha/package.json'), JSON.stringify({ name: '@zerowallscience/plugin-alpha', version: '1.0.0', dsh: { bundle: true } }))
  await writeFile(join(root, 'plugins/alpha/index.js'), 'export const value = 1\n')
  await writeFile(join(root, 'plugins/support-fixture/package.json'), JSON.stringify({ name: '@zerowallscience/support-fixture', version: '1.0.0' }))
  await writeFile(join(root, 'plugins/support-fixture/index.js'), 'export const support = true\n')
  for (const id of ['alpha', 'beta']) {
    const directory = join(root, 'resources/extensions/skills', id)
    await writeFile(join(directory, 'SKILL.md'), `# ${id}\n`)
    await mkdir(join(directory, 'tests'), { recursive: true })
    await writeFile(join(directory, 'tests/fixture.md'), 'test-only\n')
  }
  const alphaBytes = Buffer.from('alpha plugin archive')
  const supportBytes = Buffer.from('support archive')
  const records = [
    { id: '@zerowallscience/plugin-alpha', version: '1.0.0', kind: 'plugin', size: alphaBytes.length, sha256: digest(alphaBytes), sourceFingerprint: 'source-alpha-1' },
    { id: '@zerowallscience/support-fixture', version: '1.0.0', kind: 'support', size: supportBytes.length, sha256: digest(supportBytes), sourceFingerprint: 'source-support-1' },
  ]
  const skillRecords = ['alpha', 'beta'].map(id => ({ id, version: '1.0.0', sha256: digest(`${id} skill archive`) }))
  return { root, records, skillRecords }
}

test('stable lock records current plugin and packaged Skill inputs, excluding test payloads', async t => {
  const f = await fixture(t)
  const lock = await buildStableResourceLock({ ...f, artifactsRoot: join(f.root, 'artifacts') })
  assert.equal(lock.signingKeyId, 'stable-4')
  assert.equal(lock.plugins.length, 2)
  assert.equal(lock.pluginSources.length, 2)
  assert.ok(lock.pluginSources.some(item => item.id === '@zerowallscience/support-fixture' && item.version === '1.0.0'))
  assert.deepEqual(lock.skills.map(item => [item.id, item.files]), [['alpha', 1], ['beta', 1]])
  const skillRoot = join(f.root, 'resources/extensions/skills/alpha')
  assert.equal(includePackagedSkillPath(skillRoot, join(skillRoot, 'tests/fixture.md')), false)
  assert.equal((await resourceTreeFiles(skillRoot, candidate => includePackagedSkillPath(skillRoot, candidate))).length, 1)
})

test('stable lock verification rejects plugin source changes until the package feed is refreshed', async t => {
  const f = await fixture(t)
  const lock = await buildStableResourceLock({ ...f, artifactsRoot: join(f.root, 'artifacts') })
  const path = join(f.root, stableResourceLockPath)
  await writeFile(path, JSON.stringify(lock, null, 2) + '\n')
  await writeFile(join(f.root, 'plugins/alpha/index.js'), 'export const value = 2\n')
  await assert.rejects(verifyStableResourceLock({ root: f.root, records: f.records, artifactsRoot: join(f.root, 'artifacts') }), /does not match current plugin packages/u)
})

test('selective plugin refresh preserves all unrelated immutable feed entries and Skills', async t => {
  const f = await fixture(t)
  const artifactsRoot = join(f.root, 'artifacts')
  const initial = await buildStableResourceLock({ ...f, artifactsRoot })
  await writeFile(join(f.root, stableResourceLockPath), JSON.stringify(initial, null, 2) + '\n')

  const alphaManifest = join(f.root, 'plugins/alpha/package.json')
  await writeFile(alphaManifest, JSON.stringify({ name: '@zerowallscience/plugin-alpha', version: '1.1.0', dsh: { bundle: true } }))
  const nextRecords = f.records.map(record => record.id === '@zerowallscience/plugin-alpha'
    ? { ...record, version: '1.1.0', sha256: digest('alpha plugin archive v1.1.0'), size: 25 }
    : { ...record, sha256: digest('changed support bytes'), size: 20 })
  const next = await writeStableResourceLock({ root: f.root, records: nextRecords, section: 'plugins', selected: '@zerowallscience/plugin-alpha', artifactsRoot })

  assert.equal(next.plugins.find(item => item.id === '@zerowallscience/plugin-alpha').version, '1.1.0')
  assert.equal(next.plugins.find(item => item.id === '@zerowallscience/support-fixture').sha256, initial.plugins.find(item => item.id === '@zerowallscience/support-fixture').sha256)
  assert.deepEqual(next.skills, initial.skills)
})
