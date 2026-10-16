import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { acquireBuildLock } from './build-lock.mjs'
import { verifyStageCompletion } from './clone-current-stage.mjs'
import { assertFeedNotRegressed, readVerifiedPluginFeed, verifyStagePluginFeed } from '../plugins/snapshot.mjs'
const root = resolve(import.meta.dirname, '../..')
if (!process.env.npm_execpath) throw new Error('Run pnpm package:stable:win')
// Reuse verified component archives, but always integrate the latest plugin set.
const applicationVersion = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
const artifactRoot = resolve(process.env.ZEROWALL_ARTIFACT_ROOT ?? join(root, 'artifacts'))
const stageRoot = join(artifactRoot, 'stage', applicationVersion)
const pluginStore = join(artifactRoot, 'release/plugins')
const pin = JSON.parse(await readFile(join(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
const initialFeed = await readVerifiedPluginFeed(pluginStore)
const pointer = await readFile(join(stageRoot, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
let reusableStage = false
if (pointer?.applicationVersion === applicationVersion && /^[A-Za-z0-9._-]+$/u.test(pointer.buildId ?? '')) {
  try {
    await verifyStageCompletion(join(stageRoot, pointer.buildId), { applicationVersion, buildId: pointer.buildId })
    await verifyStagePluginFeed(join(stageRoot, pointer.buildId), initialFeed, pin.commit)
    reusableStage = true
  } catch { /* A partial or failed final build must be rebuilt, never cloned. */ }
}
if (!reusableStage) {
  // Incremental orchestration reuses unchanged compilers and tarballs. A changed
  // feed needs a fresh runtime/offline assembly, even within one desktop version.
  console.log(`No verified ${applicationVersion} stage with the latest plugins is available; refreshing the incremental assembly.`)
  execFileSync(process.execPath, [process.env.npm_execpath, 'build'], { cwd: root, env: process.env, stdio: 'inherit' })
}
const latestFeed = await readVerifiedPluginFeed(pluginStore)
assertFeedNotRegressed(initialFeed, latestFeed)
const prepared = JSON.parse(await readFile(join(stageRoot, 'current.json'), 'utf8'))
if (prepared.applicationVersion !== applicationVersion || !/^[A-Za-z0-9._-]+$/u.test(prepared.buildId ?? '')) throw new Error('Incremental assembly returned an invalid stage pointer.')
await verifyStageCompletion(join(stageRoot, prepared.buildId), { applicationVersion, buildId: prepared.buildId })
await verifyStagePluginFeed(join(stageRoot, prepared.buildId), latestFeed, pin.commit)
execFileSync(process.execPath, [process.env.npm_execpath, 'build', '--consumer-only'], { cwd: root, env: process.env, stdio: 'inherit' })
const activeStage = JSON.parse(await readFile(join(stageRoot, 'current.json'), 'utf8'))
if (activeStage.applicationVersion !== applicationVersion || !/^[A-Za-z0-9._-]+$/u.test(activeStage.buildId ?? '')) throw new Error('Consumer-only packaging returned an invalid active stage pointer.')
await verifyStageCompletion(join(stageRoot, activeStage.buildId), { applicationVersion, buildId: activeStage.buildId })
await verifyStagePluginFeed(join(stageRoot, activeStage.buildId), await readVerifiedPluginFeed(pluginStore), pin.commit)
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
