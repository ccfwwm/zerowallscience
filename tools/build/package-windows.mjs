import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cloneCurrentStage } from './clone-current-stage.mjs'
import { acquireBuildLock } from './build-lock.mjs'
const root = resolve(import.meta.dirname, '../..')
if (!process.env.npm_execpath) throw new Error('Run pnpm package:stable:win')
// Packaging consumes the existing verified runtime closure. A fresh build ID
// keeps outputs immutable while avoiding an unnecessary DSH/runtime rebuild.
const applicationVersion = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
const artifactRoot = resolve(process.env.ZEROWALL_ARTIFACT_ROOT ?? join(root, 'artifacts'))
const activeStage = JSON.parse(await readFile(join(artifactRoot, 'stage', applicationVersion, 'current.json'), 'utf8'))
process.env.ZEROWALL_BUILD_ID = activeStage.buildId
const { contract } = await import('./paths.mjs')
const { verifyRuntimeFreshness } = await import('../packaging/verify-runtime-freshness.mjs')
const releaseLock = await acquireBuildLock(contract.cache, 'runtime')
try {
await verifyRuntimeFreshness(root)
const next = await cloneCurrentStage({ root })
const env = {
  ...process.env,
  ELECTRON_CACHE: join(contract.cache, 'electron'),
  ELECTRON_BUILDER_CACHE: join(contract.cache, 'electron-builder'),
  ZEROWALL_TARGET: 'windows-x64',
  ZEROWALL_BUNDLE_PYTHON: '0',
  ZEROWALL_BUILD_ID: next.buildId,
}
execFileSync(process.execPath, [process.env.npm_execpath, '--filter', '@zerowallscience/desktop', 'run', 'build'], { cwd: root, env, stdio: 'inherit' })
// Management commands are desktop inputs, independent from the DSH closure.
// Refresh them from their generators instead of packaging a prior stage copy.
execFileSync(process.execPath, [process.env.npm_execpath, 'commands:prepare'], { cwd: root, env, stdio: 'inherit' })
execFileSync(process.execPath, [join(root, 'tools/packaging/prepare-offline-profile.mjs')], { cwd: root, env, stdio: 'inherit' })
execFileSync(process.execPath, [process.env.npm_execpath, '--filter', '@zerowallscience/desktop', 'run', 'package:stable:win'], { cwd: root, env, stdio: 'inherit' })
} finally { await releaseLock() }
