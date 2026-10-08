import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createCleanupPlan, removeCandidate } from './artifacts-gc-lib.mjs'

const policy = { defaults: { stageDays: 14, devDays: 14, failedBuildDays: 7, cacheDays: 30, logsDays: 90, objectDays: 30 }, protectedRoots: ['artifacts/release', 'node_modules'], managedRoots: ['artifacts/stage', 'artifacts/dev', 'artifacts/objects'] }

test('GC reports only expired generated children and preserves the active stage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-gc-'))
  try {
    const stage = join(root, 'artifacts/stage/8.0.7')
    const old = join(stage, 'old-build')
    const active = join(stage, 'active-build')
    await mkdir(old, { recursive: true }); await mkdir(active, { recursive: true })
    await writeFile(join(old, 'output.bin'), 'old')
    await writeFile(join(active, 'output.bin'), 'keep')
    await writeFile(join(stage, 'current.json'), JSON.stringify({ buildId: 'active-build' }))
    const oldTime = new Date(Date.now() - 40 * 86_400_000)
    const { utimes } = await import('node:fs/promises')
    await utimes(join(old, 'output.bin'), oldTime, oldTime)
    await utimes(old, oldTime, oldTime)
    const plan = await createCleanupPlan({ root, policy })
    assert.equal(plan.candidates.length, 1)
    assert.equal(plan.candidates[0].path, old)
    assert.ok(plan.exclusions.some(item => item.reason === 'active-stage'))
    await removeCandidate(plan.candidates[0], plan.candidates[0])
    await assert.rejects(readFile(join(old, 'output.bin')))
    assert.equal(await readFile(join(active, 'output.bin'), 'utf8'), 'keep')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('GC does not traverse symbolic links in managed output trees', async t => {
  if (process.platform === 'win32') t.skip('Creating directory symlinks may require elevated privileges on Windows.')
  const root = await mkdtemp(join(tmpdir(), 'zws-gc-link-'))
  try {
    const target = join(root, 'outside')
    const managed = join(root, 'artifacts/dev')
    await mkdir(target); await mkdir(managed, { recursive: true })
    await writeFile(join(target, 'keep.txt'), 'keep')
    await symlink(target, join(managed, 'linked'), 'junction')
    const plan = await createCleanupPlan({ root, policy })
    assert.equal(plan.candidates.length, 0)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('GC keeps referenced content objects and only reports old unreferenced objects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-gc-objects-'))
  try {
    const artifacts = join(root, 'artifacts')
    const referencedBytes = Buffer.from('published payload')
    const orphanBytes = Buffer.from('orphan payload')
    const referencedHash = createHash('sha256').update(referencedBytes).digest('hex')
    const orphanHash = createHash('sha256').update(orphanBytes).digest('hex')
    const objectPath = hash => join(artifacts, 'objects', 'sha256', hash.slice(0, 2), hash)
    await mkdir(join(artifacts, 'release/8.0.7/refs'), { recursive: true })
    await mkdir(join(artifacts, 'objects/sha256', referencedHash.slice(0, 2)), { recursive: true })
    await mkdir(join(artifacts, 'objects/sha256', orphanHash.slice(0, 2)), { recursive: true })
    await writeFile(objectPath(referencedHash), referencedBytes)
    await writeFile(objectPath(orphanHash), orphanBytes)
    await writeFile(join(artifacts, 'release/8.0.7/refs/plugin.json'), JSON.stringify({ object: `objects/sha256/${referencedHash.slice(0, 2)}/${referencedHash}` }))
    const oldTime = new Date(Date.now() - 40 * 86_400_000)
    const { utimes } = await import('node:fs/promises')
    await utimes(objectPath(referencedHash), oldTime, oldTime)
    await utimes(objectPath(orphanHash), oldTime, oldTime)

    const plan = await createCleanupPlan({ root, policy })
    assert.equal(plan.candidates.length, 1)
    assert.equal(plan.candidates[0].path, objectPath(orphanHash))
    assert.ok(plan.exclusions.some(item => item.path === objectPath(referencedHash) && item.reason === 'referenced-content-object'))
  } finally { await rm(root, { recursive: true, force: true }) }
})
