import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { cloneCurrentStage } from './clone-current-stage.mjs'

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
    await writeFile(join(source, 'resources/extensions/skills/example/SKILL.md'), 'skill payload')
    await writeFile(join(versionRoot, 'current.json'), JSON.stringify({ buildId: 'build-old', applicationVersion: '8.0.7' }))

    const result = await cloneCurrentStage({ root, buildId: 'build-new', createdAt: '2026-10-08T00:00:00.000Z' })

    assert.equal(result.sourceBuildId, 'build-old')
    assert.equal(result.buildId, 'build-new')
    assert.equal(await readFile(join(result.stage, 'resources/extensions/skills/example/SKILL.md'), 'utf8'), 'skill payload')
    assert.deepEqual(JSON.parse(await readFile(join(versionRoot, 'current.json'), 'utf8')), {
      buildId: 'build-new', applicationVersion: '8.0.7',
    })
    assert.deepEqual(JSON.parse(await readFile(join(result.stage, 'stage-clone-receipt.json'), 'utf8')), {
      schema: 1, applicationVersion: '8.0.7', buildId: 'build-new', sourceBuildId: 'build-old',
      runtimeCommit: 'dsh-commit', dshVersion: '0.2.0-rc.2', createdAt: '2026-10-08T00:00:00.000Z',
    })
    await assert.rejects(cloneCurrentStage({ root, buildId: 'build-new' }), /matches the active build ID/u)
    await mkdir(join(versionRoot, 'build-existing'))
    await assert.rejects(cloneCurrentStage({ root, buildId: 'build-existing' }), /Refusing to overwrite an existing build stage/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
