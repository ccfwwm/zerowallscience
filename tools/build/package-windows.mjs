import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { acquireBuildLock } from './build-lock.mjs'
import { verifyStageCompletion } from './clone-current-stage.mjs'
const root = resolve(import.meta.dirname, '../..')
if (!process.env.npm_execpath) throw new Error('Run pnpm package:stable:win')
// Stable packaging is a consumer of a previously verified component stage.
// It must never trigger a plugin compile or repack as a side effect of making
// a Desktop installer.
const applicationVersion = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
const artifactRoot = resolve(process.env.ZEROWALL_ARTIFACT_ROOT ?? join(root, 'artifacts'))
const stageRoot = join(artifactRoot, 'stage', applicationVersion)
const pointer = await readFile(join(stageRoot, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
let reusableStage = false
if (pointer?.applicationVersion === applicationVersion && /^[A-Za-z0-9._-]+$/u.test(pointer.buildId ?? '')) {
  try {
    await verifyStageCompletion(join(stageRoot, pointer.buildId), { applicationVersion, buildId: pointer.buildId })
    reusableStage = true
  } catch { /* A partial or failed final build must be rebuilt, never cloned. */ }
}
if (!reusableStage) {
  // A first release, an interrupted build, or a stage from another desktop
  // version must create a verified component stage before desktop-only
  // packaging can clone it. This full build happens once per application
  // version; later desktop packaging reuses the immutable plugin store.
  console.log(`No verified ${applicationVersion} component stage is available; creating one before desktop-only packaging.`)
  execFileSync(process.execPath, [process.env.npm_execpath, 'build'], { cwd: root, env: process.env, stdio: 'inherit' })
}
execFileSync(process.execPath, [process.env.npm_execpath, 'build', '--consumer-only'], { cwd: root, env: process.env, stdio: 'inherit' })
const activeStage = JSON.parse(await readFile(join(stageRoot, 'current.json'), 'utf8'))
if (activeStage.applicationVersion !== applicationVersion || !/^[A-Za-z0-9._-]+$/u.test(activeStage.buildId ?? '')) throw new Error('Consumer-only packaging returned an invalid active stage pointer.')
await verifyStageCompletion(join(stageRoot, activeStage.buildId), { applicationVersion, buildId: activeStage.buildId })
process.env.ZEROWALL_BUILD_ID = activeStage.buildId
const { contract } = await import('./paths.mjs')
const { verifyRuntimeFreshness } = await import('../packaging/verify-runtime-freshness.mjs')
const releaseLock = await acquireBuildLock(contract.cache, 'runtime')
try {
await verifyRuntimeFreshness(root)
const env = {
  ...process.env,
  ELECTRON_CACHE: join(contract.cache, 'electron'),
  ELECTRON_BUILDER_CACHE: join(contract.cache, 'electron-builder'),
  ZEROWALL_TARGET: 'windows-x64',
  ZEROWALL_BUNDLE_PYTHON: '0',
  ZEROWALL_BUILD_ID: activeStage.buildId,
}
execFileSync(process.execPath, [process.env.npm_execpath, '--filter', '@zerowallscience/desktop', 'run', 'package:stable:win'], { cwd: root, env, stdio: 'inherit' })
} finally { await releaseLock() }
