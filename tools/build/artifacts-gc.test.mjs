import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createCleanupPlan, removeCandidate } from './artifacts-gc-lib.mjs'

const policy = { defaults: { stageDays: 14, devDays: 14, failedBuildDays: 7, cacheDays: 30, logsDays: 90, objectDays: 30 }, protectedRoots: ['artifacts/release', 'node_modules'], managedRoots: ['artifacts/stage', 'artifacts/dev', 'artifacts/objects'] }

test('GC retains the current and previous successful stage by count', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-gc-retention-'))
  try {
    const stage = join(root, 'artifacts/stage/8.1.1')
    await mkdir(stage, { recursive: true })
    for (const [id, time] of [['oldest', 1], ['previous', 2], ['current', 3]]) {
      const path = join(stage, id); await mkdir(join(path, 'runtime'), { recursive: true })
      await writeFile(join(path, 'runtime/build-receipt.json'), JSON.stringify({ status: 'success', finishedAt: `2026-10-0${time}T00:00:00.000Z` }))
      await writeFile(join(path, 'payload'), id)
    }
    await writeFile(join(stage, 'current.json'), JSON.stringify({ buildId: 'current' }))
    const plan = await createCleanupPlan({ root, now: Date.parse('2026-10-10T00:00:00.000Z'), policy: { ...policy, defaults: { ...policy.defaults, keepStagesPerVersion: 2 } } })
    assert.ok(plan.exclusions.some(item => item.path.endsWith('current') && item.reason === 'active-stage'))
    assert.ok(plan.exclusions.some(item => item.path.endsWith('previous') && item.reason === 'retained-successful-stage'))
    assert.ok(plan.candidates.some(item => item.path.endsWith('oldest') && item.reason === 'successful-stage-over-retention'))
  } finally { await rm(root, { recursive: true, force: true }) }
})

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

test('GC does not traverse symbolic links in managed output trees', async () => {
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

test('GC preserves expired output trees containing nested dependency directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-gc-dependencies-'))
  try {
    const output = join(root, 'artifacts/dev/old-output')
    const dependencies = join(output, 'runtime/NoDe_MoDuLeS/local-package')
    await mkdir(dependencies, { recursive: true })
    await writeFile(join(dependencies, 'keep.js'), 'user dependency')
    await writeFile(join(output, 'output.bin'), 'old')
    const oldTime = new Date(Date.now() - 40 * 86_400_000)
    for (const path of [join(output, 'output.bin'), join(dependencies, 'keep.js'), dependencies, join(output, 'runtime/NoDe_MoDuLeS'), join(output, 'runtime'), output]) {
      await utimes(path, oldTime, oldTime)
    }
    const plan = await createCleanupPlan({ root, policy })
    assert.equal(plan.candidates.length, 0)
    assert.ok(plan.exclusions.some(item => item.path === output && item.reason === 'contains-protected-node-modules'))
    assert.equal(await readFile(join(dependencies, 'keep.js'), 'utf8'), 'user dependency')
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('GC refuses to delete a candidate if an empty dependency directory appeared after planning', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-gc-late-dependencies-'))
  try {
    const output = join(root, 'artifacts/dev/old-output')
    await mkdir(output, { recursive: true })
    await writeFile(join(output, 'output.bin'), 'old')
    const oldTime = new Date(Date.now() - 40 * 86_400_000)
    await utimes(join(output, 'output.bin'), oldTime, oldTime)
    await utimes(output, oldTime, oldTime)
    const plan = await createCleanupPlan({ root, policy })
    assert.equal(plan.candidates.length, 1)
    await mkdir(join(output, 'node_modules'))
    await assert.rejects(removeCandidate(plan.candidates[0], plan.candidates[0]), /protected node_modules/u)
    assert.equal(await readFile(join(output, 'output.bin'), 'utf8'), 'old')
  } finally { await rm(root, { recursive: true, force: true }) }
})
