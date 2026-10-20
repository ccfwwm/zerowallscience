import { execFileSync } from 'node:child_process'
import { readFile, lstat, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { acquireBuildLock } from './build-lock.mjs'
import { verifyStageCompletion } from './clone-current-stage.mjs'
import { assertFeedNotRegressed, readVerifiedPluginFeed, verifyStagePluginFeed } from '../plugins/snapshot.mjs'
import { readStableConfig, stableEnvironment } from './stable-config.mjs'
import { syncDesktopRelease } from './sync-desktop-release.mjs'
import paths from './paths.cjs'
const root = resolve(import.meta.dirname, '../..')
if (!process.env.npm_execpath) throw new Error('Run pnpm package:stable:win')
const stable = await readStableConfig(root)
await syncDesktopRelease(root)
Object.assign(process.env, stableEnvironment(root, stable))
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error('Stable packaging requires a stable desktop version')
// Reuse verified component archives, but always integrate the latest plugin set.
const applicationVersion = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
const artifactRoot = resolve(process.env.ZEROWALL_ARTIFACT_ROOT ?? join(root, 'artifacts'))
const installer = resolve(process.env.ZEROWALL_PACKAGE_OUTPUT || join(artifactRoot, 'packages', applicationVersion, stable.target), `zerowall-science-${applicationVersion}-win-x64.exe`)
if (await lstat(installer).catch(error => error.code === 'ENOENT' ? undefined : Promise.reject(error))) throw new Error('This stable installer already exists. Verify/reuse it, or set a new version in config/build/desktop-release.json. Existing stable bytes are never overwritten.')
await access(process.env.ZEROWALL_RESOURCE_PRIVATE_KEY_FILE)
const stageRoot = join(artifactRoot, 'stage', applicationVersion)
const pluginStore = join(artifactRoot, 'release/plugins')
const pin = JSON.parse(await readFile(join(root, 'config/deepseek-harness/upstream.json'), 'utf8'))
const { verifyRuntimeFreshness } = await import('../packaging/verify-runtime-freshness.mjs')
const initialFeed = await readVerifiedPluginFeed(pluginStore)
const pointer = await readFile(join(stageRoot, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
let reusableStage = false
if (pointer?.applicationVersion === applicationVersion && /^[A-Za-z0-9._-]+$/u.test(pointer.buildId ?? '')) {
  try {
    await verifyStageCompletion(join(stageRoot, pointer.buildId), { applicationVersion, buildId: pointer.buildId })
    await verifyStagePluginFeed(join(stageRoot, pointer.buildId), initialFeed, pin.commit)
    // A matching plugin feed does not prove the shared DSH closure or local
    // plugin outputs are current. Check before spending time cloning a stage.
    await verifyRuntimeFreshness(root)
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
// A fresh assembly has already built Desktop and has a new build ID. Only an
// existing successful stage needs a consumer clone; never create both.
if (reusableStage) execFileSync(process.execPath, [process.env.npm_execpath, 'build', '--consumer-only'], { cwd: root, env: process.env, stdio: 'inherit' })
const activeStage = JSON.parse(await readFile(join(stageRoot, 'current.json'), 'utf8'))
if (activeStage.applicationVersion !== applicationVersion || !/^[A-Za-z0-9._-]+$/u.test(activeStage.buildId ?? '')) throw new Error('Consumer-only packaging returned an invalid active stage pointer.')
await verifyStageCompletion(join(stageRoot, activeStage.buildId), { applicationVersion, buildId: activeStage.buildId })
await verifyStagePluginFeed(join(stageRoot, activeStage.buildId), await readVerifiedPluginFeed(pluginStore), pin.commit)
process.env.ZEROWALL_BUILD_ID = activeStage.buildId
// Snapshot helpers may have loaded paths.mjs before config sync or assembly.
// Read the final version/build ID now instead of reusing that module's snapshot.
const contract = paths.buildPaths(root)
const { prepareBundledPython } = await import('../packaging/bundled-python.mjs')
if (!stable.bundlePython) throw new Error('Stable Windows installers require the signed offline Python bootstrap')
await prepareBundledPython(root, contract.stage, contract.cache)
const { verifyBundledResources } = await import('../packaging/verify-bundled-resources.mjs')
const integrated = await verifyBundledResources({ root, stage: contract.stage, release: contract.release, cache: contract.cache,
  publicBase: process.env.ZEROWALL_RESOURCE_BASE_URL ?? 'https://zerowall.chengxunkeji.cn/stable' })
console.log(`Verified latest bundled resources: ${integrated.plugins.length} packages and ${integrated.skills.length} Skills`)
const releaseLock = await acquireBuildLock(contract.cache, 'runtime')
try {
await verifyRuntimeFreshness(root)
const env = {
  ...process.env,
  ELECTRON_CACHE: join(contract.cache, 'electron'),
  ELECTRON_BUILDER_CACHE: join(contract.cache, 'electron-builder'),
  ZEROWALL_TARGET: stable.target,
  ZEROWALL_BUNDLE_PYTHON: stable.bundlePython ? '1' : '0',
  ZEROWALL_BUILD_ID: activeStage.buildId,
}
execFileSync(process.execPath, [process.env.npm_execpath, '--filter', '@zerowallscience/desktop', 'run', 'package:stable:win'], { cwd: root, env, stdio: 'inherit' })
} finally { await releaseLock() }
if (stable.retention.afterPackage) execFileSync(process.execPath, [join(root, 'tools/build/artifacts-gc.mjs'), '--apply', '--prune-incomplete'], { cwd: root, env: process.env, stdio: 'inherit' })
