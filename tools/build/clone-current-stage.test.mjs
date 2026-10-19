import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { activateStage, cloneCurrentStage, verifyStageCompletion } from './clone-current-stage.mjs'

const snapshotId = 'a'.repeat(64)
async function completeStage(source, applicationVersion, buildId) {
  await mkdir(join(source, 'dsh'), { recursive: true })
  await mkdir(join(source, 'offline-profile'), { recursive: true })
  for (const path of ['dsh/build-receipt.json', 'offline-profile/receipt.json', 'runtime/integrity-receipt.json']) await writeFile(join(source, path), '{}')
  await writeFile(join(source, 'plugin-snapshot.json'), JSON.stringify({ applicationVersion, snapshotId }))
  await writeFile(join(source, 'build-receipt.json'), JSON.stringify({ status: 'success', applicationVersion, buildId, pluginSnapshotId: snapshotId }))
}

test('clones the active runtime stage under a new build ID and switches the pointer atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-stage-clone-'))
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '8.0.7' }))
    const versionRoot = join(root, 'artifacts/stage/8.0.7')
    const source = join(versionRoot, 'build-old')
    await mkdir(join(source, 'runtime'), { recursive: true })
    await mkdir(join(source, 'resources/extensions/skills/example'), { recursive: true })
    await writeFile(join(source, 'runtime/build-receipt.json'), JSON.stringify({
      commit: 'dsh-commit', version: '0.2.0-rc.2', applicationVersion: '8.0.7',
    }))
    await writeFile(join(source, 'runtime/payload.bin'), 'immutable runtime')
    await completeStage(source, '8.0.7', 'build-old')
    await writeFile(join(source, 'resources/extensions/skills/example/SKILL.md'), 'skill payload')
    await writeFile(join(versionRoot, 'current.json'), JSON.stringify({ buildId: 'build-old', applicationVersion: '8.0.7' }))

    const result = await cloneCurrentStage({ root, buildId: 'build-new', createdAt: '2026-10-08T00:00:00.000Z' })

    assert.equal(result.sourceBuildId, 'build-old')
    assert.equal(result.buildId, 'build-new')
    assert.equal(await readFile(join(result.stage, 'resources/extensions/skills/example/SKILL.md'), 'utf8'), 'skill payload')
    assert.deepEqual(JSON.parse(await readFile(join(versionRoot, 'current.json'), 'utf8')), {
      buildId: 'build-new', applicationVersion: '8.0.7',
    })
    const cloneReceipt = JSON.parse(await readFile(join(result.stage, 'stage-clone-receipt.json'), 'utf8'))
    assert.deepEqual({ ...cloneReceipt, materialization: undefined }, {
      schema: 1, applicationVersion: '8.0.7', buildId: 'build-new', sourceBuildId: 'build-old',
      runtimeCommit: 'dsh-commit', dshVersion: '0.2.0-rc.2', createdAt: '2026-10-08T00:00:00.000Z', materialization: undefined,
      pluginSnapshotId: snapshotId,
    })
    assert.equal(cloneReceipt.materialization.mode, 'mixed')
    assert.equal((await stat(join(source, 'runtime/payload.bin'))).ino, (await stat(join(result.stage, 'runtime/payload.bin'))).ino)
    assert.equal((await stat(join(source, 'resources/extensions/skills/example/SKILL.md'))).ino, (await stat(join(result.stage, 'resources/extensions/skills/example/SKILL.md'))).ino)
    assert.notEqual((await stat(join(source, 'runtime/build-receipt.json'))).ino, (await stat(join(result.stage, 'runtime/build-receipt.json'))).ino)
    await writeFile(join(result.stage, 'runtime/build-receipt.json'), JSON.stringify({
      commit: 'new-commit', version: '0.2.0-rc.2', applicationVersion: '8.0.7',
    }))
    assert.equal(JSON.parse(await readFile(join(source, 'runtime/build-receipt.json'), 'utf8')).commit, 'dsh-commit')
    assert.equal((await verifyStageCompletion(result.stage, { applicationVersion: '8.0.7', buildId: 'build-new' })).receipt.sourceBuildId, 'build-old')
    assert.notEqual((await stat(join(source, 'plugin-snapshot.json'))).ino, (await stat(join(result.stage, 'plugin-snapshot.json'))).ino)
    await assert.rejects(cloneCurrentStage({ root, buildId: 'build-new' }), /matches the active build ID/u)
    await mkdir(join(versionRoot, 'build-existing'))
    await assert.rejects(cloneCurrentStage({ root, buildId: 'build-existing' }), /Refusing to overwrite an existing build stage/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('consumer-only clone fails closed when the active pointer belongs to another application version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-stage-version-'))
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '8.3.0' }))
    const versionRoot = join(root, 'artifacts/stage/8.3.0')
    await mkdir(join(versionRoot, 'old-build', 'runtime'), { recursive: true })
    await writeFile(join(versionRoot, 'old-build', 'runtime/build-receipt.json'), JSON.stringify({ commit: 'dsh', version: '0.2.0-rc.2', applicationVersion: '8.2.1' }))
    await writeFile(join(versionRoot, 'current.json'), JSON.stringify({ buildId: 'old-build', applicationVersion: '8.2.1' }))
    await assert.rejects(cloneCurrentStage({ root, buildId: 'new-build', activate: false }), /invalid application version/u)
    assert.deepEqual(JSON.parse(await readFile(join(versionRoot, 'current.json'), 'utf8')), { buildId: 'old-build', applicationVersion: '8.2.1' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('failed candidate materialization leaves the old current pointer active', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-stage-failure-'))
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '8.3.0' }))
    const versionRoot = join(root, 'artifacts/stage/8.3.0')
    const source = join(versionRoot, 'old-build')
    await mkdir(join(source, 'runtime'), { recursive: true })
    await writeFile(join(source, 'runtime/build-receipt.json'), JSON.stringify({ commit: 'dsh', version: '0.2.0-rc.2', applicationVersion: '8.3.0' }))
    await writeFile(join(source, 'runtime/payload.bin'), 'payload')
    await completeStage(source, '8.3.0', 'old-build')
    await writeFile(join(versionRoot, 'current.json'), JSON.stringify({ buildId: 'old-build', applicationVersion: '8.3.0' }))
    const original = await readFile(join(versionRoot, 'current.json'), 'utf8')
    const destination = join(versionRoot, 'new-build')
    await mkdir(destination, { recursive: true })
    await assert.rejects(cloneCurrentStage({ root, buildId: 'new-build', activate: false }), /Refusing to overwrite/u)
    assert.equal(await readFile(join(versionRoot, 'current.json'), 'utf8'), original)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('runtime-only, failed, incomplete and mismatched final receipts cannot be reused or activated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-stage-final-'))
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '8.3.0' }))
    const versionRoot = join(root, 'artifacts/stage/8.3.0'), source = join(versionRoot, 'old-build')
    await mkdir(join(source, 'runtime'), { recursive: true })
    await writeFile(join(source, 'runtime/build-receipt.json'), JSON.stringify({ commit: 'dsh', version: '0.2.0-rc.2', applicationVersion: '8.3.0' }))
    const pointer = JSON.stringify({ applicationVersion: '8.3.0', buildId: 'old-build' })
    await writeFile(join(versionRoot, 'current.json'), pointer)
    await assert.rejects(cloneCurrentStage({ root, buildId: 'candidate', activate: false }), /ENOENT/u)
    await completeStage(source, '8.3.0', 'old-build')
    const valid = JSON.parse(await readFile(join(source, 'build-receipt.json'), 'utf8'))
    for (const changed of [{ status: 'failed' }, { status: 'pending' }, { applicationVersion: '8.2.1' }, { buildId: 'other-build' }, { pluginSnapshotId: undefined }, { pluginSnapshotId: 'b'.repeat(64) }]) {
      await writeFile(join(source, 'build-receipt.json'), JSON.stringify({ ...valid, ...changed }))
      await assert.rejects(cloneCurrentStage({ root, buildId: 'candidate', activate: false }), /final build receipt|plugin snapshot/u)
      await assert.rejects(activateStage({ root, applicationVersion: '8.3.0', buildId: 'old-build' }), /final build receipt|plugin snapshot/u)
      assert.equal(await readFile(join(versionRoot, 'current.json'), 'utf8'), pointer)
      await assert.rejects(stat(join(versionRoot, 'candidate')), { code: 'ENOENT' })
    }
    await writeFile(join(source, 'build-receipt.json'), JSON.stringify(valid))
    await rm(join(source, 'plugin-snapshot.json'))
    await assert.rejects(cloneCurrentStage({ root, buildId: 'candidate', activate: false }), /ENOENT/u)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('inactive consumer clone retains snapshot binding but cannot activate before final success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-stage-pending-'))
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ version: '8.3.0' }))
    const versionRoot = join(root, 'artifacts/stage/8.3.0'), source = join(versionRoot, 'old-build')
    await mkdir(join(source, 'runtime'), { recursive: true })
    await writeFile(join(source, 'runtime/build-receipt.json'), JSON.stringify({ commit: 'dsh', version: '0.2.0-rc.2', applicationVersion: '8.3.0' }))
    await completeStage(source, '8.3.0', 'old-build')
    const pointer = JSON.stringify({ applicationVersion: '8.3.0', buildId: 'old-build' })
    await writeFile(join(versionRoot, 'current.json'), pointer)
    const result = await cloneCurrentStage({ root, buildId: 'candidate', activate: false })
    const receipt = JSON.parse(await readFile(join(result.stage, 'build-receipt.json'), 'utf8'))
    assert.equal(receipt.status, 'pending')
    assert.equal(receipt.buildId, 'candidate')
    assert.equal(receipt.pluginSnapshotId, snapshotId)
    await assert.rejects(activateStage({ root, applicationVersion: '8.3.0', buildId: 'candidate' }), /successful final build receipt/u)
    await writeFile(join(result.stage, 'plugin-snapshot.json'), JSON.stringify({ applicationVersion: '8.3.0', snapshotId: 'b'.repeat(64) }))
    assert.equal(JSON.parse(await readFile(join(source, 'plugin-snapshot.json'), 'utf8')).snapshotId, snapshotId)
    assert.equal(JSON.parse(await readFile(join(source, 'build-receipt.json'), 'utf8')).status, 'success')
    assert.equal(await readFile(join(versionRoot, 'current.json'), 'utf8'), pointer)
  } finally { await rm(root, { recursive: true, force: true }) }
})
