import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { expectedGeneratedLibPath, findWorkspaceRoot } from './clean-lib-paths.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('output path follows the root artifact contract after package reorganization', async () => {
  const workspaceRoot = resolve(packageRoot, '../../..')
  assert.equal(await findWorkspaceRoot(packageRoot), workspaceRoot)
  assert.equal(await expectedGeneratedLibPath(packageRoot), resolve(workspaceRoot, 'artifacts/dev/dsh-file-review/lib'))
})

test('workspace discovery works from a nested package path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-clean-lib-path-'))
  const nestedPackage = join(root, 'packages', 'dsh', 'dsh-file-review')
  try {
    await mkdir(nestedPackage, { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'zerowallscience' }))
    assert.equal(await findWorkspaceRoot(nestedPackage), root)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('standalone output links require an explicit artifact root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'zws-clean-lib-standalone-'))
  try {
    assert.equal(await expectedGeneratedLibPath(root, {}), undefined)
    assert.equal(
      await expectedGeneratedLibPath(root, { ZEROWALL_ARTIFACT_ROOT: join(root, 'artifacts') }),
      resolve(root, 'artifacts/dev/dsh-file-review/lib'),
    )
  } finally { await rm(root, { recursive: true, force: true }) }
})
