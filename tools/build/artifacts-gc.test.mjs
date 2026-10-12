import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { link, mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createCleanupPlan, measureArtifactSpace, removeCandidate } from './artifacts-gc-lib.mjs'

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

test('GC can retire generated stages that contain packaged node_modules', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-gc-stage-dependencies-'))
  try {
    const stage = join(root, 'artifacts/stage/8.1.2')
    await mkdir(stage, { recursive: true })
    for (const [id, time] of [['oldest', 1], ['current', 2]]) {
      const path = join(stage, id)
      await mkdir(join(path, 'runtime/node_modules/generated'), { recursive: true })
      await writeFile(join(path, 'runtime/node_modules/generated/package.json'), '{}')
      await writeFile(join(path, 'runtime/payload'), id)
      await writeFile(join(path, 'runtime/build-receipt.json'), JSON.stringify({ status: 'success', finishedAt: `2026-10-0${time}T00:00:00.000Z` }))
    }
    await writeFile(join(stage, 'current.json'), JSON.stringify({ buildId: 'current' }))
    const plan = await createCleanupPlan({ root, now: Date.parse('2026-10-10T00:00:00.000Z'), policy: { ...policy, defaults: { ...policy.defaults, keepStagesPerVersion: 1 } } })
    assert.ok(plan.candidates.some(item => item.path.endsWith('oldest') && item.reason === 'successful-stage-over-retention'))
    await removeCandidate(plan.candidates.find(item => item.path.endsWith('oldest')), plan.candidates.find(item => item.path.endsWith('oldest')))
    await assert.rejects(readFile(join(stage, 'oldest/runtime/payload')))
    assert.equal(await readFile(join(stage, 'current/runtime/payload'), 'utf8'), 'current')
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

test('GC prunes incomplete stages only when explicitly requested', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-gc-incomplete-'))
  try {
    const versionRoot = join(root, 'artifacts/stage/8.1.2')
    const active = join(versionRoot, 'active'), incomplete = join(versionRoot, 'incomplete')
    await mkdir(active, { recursive: true }); await mkdir(incomplete, { recursive: true })
    await writeFile(join(active, 'build-receipt.json'), JSON.stringify({ status: 'success', finishedAt: '2026-10-10T00:00:00.000Z' }))
    await writeFile(join(incomplete, 'partial.bin'), 'partial')
    await writeFile(join(versionRoot, 'current.json'), JSON.stringify({ buildId: 'active', applicationVersion: '8.1.2' }))
    const options = { root, now: Date.parse('2026-10-11T00:00:00.000Z'), policy: { ...policy, version: '8.1.2', defaults: { ...policy.defaults, keepStagesPerVersion: 1 } } }
    const defaultPlan = await createCleanupPlan(options)
    assert.equal(defaultPlan.candidates.some(item => item.path === incomplete), false)
    const prunePlan = await createCleanupPlan({ ...options, pruneIncomplete: true })
    assert.ok(prunePlan.candidates.some(item => item.path === incomplete && item.reason === 'incomplete-build-expired'))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('GC removes disposable historical verification trees and unpacked package output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-gc-disposable-'))
  try {
    const oldVerification = join(root, 'artifacts/verification/8.1.1/isolated-old')
    const oldNative = join(root, 'artifacts/verification/8.1.1/native-pack')
    const unpacked = join(root, 'artifacts/packages/8.1.2/windows-x64/win-unpacked')
    await mkdir(join(oldVerification, 'data'), { recursive: true }); await mkdir(join(oldNative, 'run'), { recursive: true }); await mkdir(unpacked, { recursive: true })
    await writeFile(join(oldVerification, 'data/payload'), 'old')
    await writeFile(join(oldVerification, 'receipt.json'), JSON.stringify({ path: oldVerification }))
    await writeFile(join(oldNative, 'run/native'), 'old')
    await writeFile(join(unpacked, 'app.asar'), 'temporary')
    await writeFile(join(root, 'artifacts/packages/8.1.2/windows-x64/artifact-manifest.json'), JSON.stringify({ buildId: 'current' }))
    const plan = await createCleanupPlan({ root, policy: { ...policy, version: '8.1.2' }, pruneUnpacked: true })
    assert.ok(plan.candidates.some(item => item.path === oldVerification && item.reason === 'historical-verification-disposable'))
    assert.ok(plan.candidates.some(item => item.path === oldNative && item.reason === 'historical-verification-disposable'))
    assert.ok(plan.candidates.some(item => item.path === unpacked && item.reason === 'disposable-package-unpacked'))
    const candidate = plan.candidates.find(item => item.path === oldVerification)
    await removeCandidate(candidate, candidate)
    assert.equal(JSON.parse(await readFile(join(root, 'artifacts/verification/8.1.1/summaries/isolated-old/receipt.json'), 'utf8')).path, oldVerification)
    await assert.rejects(readFile(join(oldVerification, 'data/payload')))
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('GC protects external Windows receipt references and rechecks active locks', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-gc-references-')); t.after(() => rm(root, { recursive: true, force: true }))
  const target = join(root, 'artifacts/stage/8.1.2/incomplete')
  await mkdir(target, { recursive: true }); await writeFile(join(target, 'payload'), 'keep')
  await mkdir(join(root, 'artifacts/release/8.1.2'), { recursive: true })
  const receiptPath = join(root, 'artifacts/release/8.1.2/receipt.json')
  await writeFile(receiptPath, JSON.stringify({ target: target.replaceAll('/', '\\') }))
  assert.equal((await createCleanupPlan({ root, policy, pruneIncomplete: true })).candidates.length, 0)
  await rm(receiptPath)
  const plan = await createCleanupPlan({ root, policy, pruneIncomplete: true })
  const lock = join(root, 'artifacts/cache/build-graph/locks/runtime.lock')
  await mkdir(lock, { recursive: true }); await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid }))
  await assert.rejects(createCleanupPlan({ root, policy, pruneIncomplete: true }), /active/u)
  await assert.rejects(removeCandidate(plan.candidates[0], plan.candidates[0]), /active/u)
  assert.equal(await readFile(join(target, 'payload'), 'utf8'), 'keep')
})

test('space accounting counts shared inodes once and excludes external hard links from reclaimable bytes', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-space-')); t.after(() => rm(root, { recursive: true, force: true }))
  const a = join(root, 'a'), b = join(root, 'b')
  await mkdir(a); await mkdir(b)
  await writeFile(join(a, 'payload'), 'shared'); await link(join(a, 'payload'), join(b, 'payload'))
  assert.deepEqual(await measureArtifactSpace([a]), { files: 1, bytes: 6, uniqueBytes: 6, reclaimableBytes: 0 })
  assert.deepEqual(await measureArtifactSpace([a, b]), { files: 2, bytes: 12, uniqueBytes: 6, reclaimableBytes: 6 })
})

test('GC retains two caches per kind and protects a referenced older cache', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-gc-cache-retention-')); t.after(() => rm(root, { recursive: true, force: true }))
  const artifacts = join(root, 'artifacts')
  const families = [['cache/runtime-assemblies/core', 'receipt.json'], ['cache/runtime-assemblies/offline', 'receipt.json'], ['cache/offline-carriers', 'payload.json']]
  for (const [family, receiptName] of families) {
    for (let index = 1; index <= 4; index++) {
      const path = join(artifacts, family, `entry-${index}`)
      await mkdir(path, { recursive: true })
      await writeFile(join(path, receiptName), '{}')
      await writeFile(join(path, 'payload'), `${family}-${index}`)
      const time = new Date(`2026-10-0${index}T00:00:00.000Z`)
      await utimes(join(path, receiptName), time, time)
    }
  }
  const active = join(artifacts, 'stage/8.1.2/active')
  await mkdir(active, { recursive: true })
  await writeFile(join(active, 'build-receipt.json'), JSON.stringify({ status: 'success' }))
  await writeFile(join(active, 'runtime-receipt.json'), JSON.stringify({ sourceKey: 'entry-1' }))
  await writeFile(join(artifacts, 'stage/8.1.2/current.json'), JSON.stringify({ buildId: 'active' }))
  const plan = await createCleanupPlan({ root, policy: { ...policy, version: '8.1.2', defaults: { ...policy.defaults, keepRuntimeAssembliesPerKind: 2, keepOfflineCarriers: 2 } } })
  assert.equal(plan.candidates.length, 3)
  assert.ok(plan.candidates.every(item => item.path.endsWith('entry-2') && item.reason === 'cache-over-retention'))
  assert.equal(plan.exclusions.filter(item => item.reason === 'retained-cache').length, 6)
  assert.equal(plan.exclusions.filter(item => item.reason === 'referenced-build').length, 3)
})

test('GC keeps current verification payloads and external references to historical evidence', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-gc-verification-retention-')); t.after(() => rm(root, { recursive: true, force: true }))
  const verification = join(root, 'artifacts/verification')
  const current = join(verification, '8.1.2/isolated-current'), referenced = join(verification, '8.1.1/isolated-referenced')
  for (const path of [current, referenced]) {
    await mkdir(path, { recursive: true }); await writeFile(join(path, 'payload'), 'keep')
  }
  await writeFile(join(verification, '8.1.2/receipt.json'), JSON.stringify({ evidence: referenced }))
  const plan = await createCleanupPlan({ root, policy: { ...policy, version: '8.1.2' }, pruneIncomplete: true })
  assert.equal(plan.candidates.length, 0)
  assert.ok(plan.exclusions.some(item => item.path === referenced && item.reason === 'referenced-build'))
  assert.equal(await readFile(join(current, 'payload'), 'utf8'), 'keep')
})

test('explicit incomplete pruning removes owned cache candidates while retaining rollback snapshots', async t => {
  const root = await mkdtemp(join(tmpdir(), 'zws-gc-cache-candidate-')); t.after(() => rm(root, { recursive: true, force: true }))
  const cache = join(root, 'artifacts/cache/runtime-assemblies/core')
  const key = 'a'.repeat(64), uuid = '12345678-1234-1234-1234-123456789abc'
  const candidate = join(cache, `${key}.candidate-${uuid}`), damaged = join(cache, `${key}.damaged-${uuid}`)
  for (const path of [candidate, damaged]) {
    await mkdir(join(path, 'modules/node_modules'), { recursive: true })
    await writeFile(join(path, 'modules/node_modules/payload'), 'generated')
  }
  assert.equal((await createCleanupPlan({ root, policy })).candidates.length, 0)
  const plan = await createCleanupPlan({ root, policy, pruneIncomplete: true })
  assert.equal(plan.candidates.length, 1)
  assert.equal(plan.candidates[0].path, candidate)
  await removeCandidate(plan.candidates[0], plan.candidates[0])
  await assert.rejects(readFile(join(candidate, 'modules/node_modules/payload')))
  assert.equal(await readFile(join(damaged, 'modules/node_modules/payload'), 'utf8'), 'generated')
})
