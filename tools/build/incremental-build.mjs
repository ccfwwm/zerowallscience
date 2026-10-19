import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { acquireBuildLock } from './build-lock.mjs'

const root = resolve(import.meta.dirname, '../..')
const pnpm = process.env.npm_execpath
if (!pnpm) throw new Error('Run pnpm build or pnpm build:full')
const force = process.argv.includes('--force')
const consumerOnly = process.argv.includes('--consumer-only')
function run(args) { execFileSync(process.execPath, [pnpm, ...args], { cwd: root, env: process.env, stdio: 'inherit' }) }
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
const artifacts = resolve(process.env.ZEROWALL_ARTIFACT_ROOT ?? join(root, 'artifacts'))
const releaseBuildLock = await acquireBuildLock(join(artifacts, 'cache'), 'formal-build')
let fullStage
async function pluginSnapshotId(stage) {
  const snapshot = JSON.parse(await readFile(join(stage, 'plugin-snapshot.json'), 'utf8'))
  if (snapshot.applicationVersion !== version || !/^[a-f0-9]{64}$/u.test(snapshot.snapshotId ?? '')) throw new Error('The completed build requires a valid stage plugin snapshot for this application version.')
  return snapshot.snapshotId
}
try {
  if (consumerOnly) {
    // Stable packaging consumes a previously verified runtime stage. It is
    // deliberately fail-closed: no plugin compiler, runtime assembly, or
    // resource preparation may run on this path. Commands are desktop-owned
    // code and must refresh even when the plugin/runtime closure is unchanged.
    const pointer = await readFile(join(artifacts, 'stage', version, 'current.json'), 'utf8').then(JSON.parse, () => undefined)
    if (!pointer?.buildId) throw new Error(`Consumer-only packaging requires an active verified stage for ${version}; run pnpm build once to create it.`)
    const { cloneCurrentStage, activateStage } = await import('./clone-current-stage.mjs')
    const cloned = await cloneCurrentStage({ activate: false })
    process.env.ZEROWALL_BUILD_ID = cloned.buildId
    const stage = cloned.stage
    try {
      for (const file of ['dsh/build-receipt.json', 'runtime/build-receipt.json', 'offline-profile/receipt.json', 'runtime/integrity-receipt.json']) {
        if (!(await stat(join(stage, file)).catch(() => undefined))) throw new Error(`Consumer-only stage is incomplete: ${join(stage, file)}`)
      }
      run(['version:check'])
      run(['dsh:verify'])
      run(['plugins:pack', '--consumer-only'])
      run(['commands:prepare'])
      execFileSync(process.execPath, [join(root, 'tools/build/build-graph.mjs'), 'desktop'], { cwd: root, env: process.env, stdio: 'inherit' })
      const { verifyRuntimeFreshness } = await import('../packaging/verify-runtime-freshness.mjs')
      await verifyRuntimeFreshness(root)
      await writeFile(join(stage, 'build-receipt.json'), JSON.stringify({ schema: 2, status: 'success', mode: 'consumer-only', applicationVersion: version, buildId: cloned.buildId, sourceBuildId: cloned.sourceBuildId, pluginSnapshotId: await pluginSnapshotId(stage), finishedAt: new Date().toISOString() }, null, 2))
      await activateStage({ applicationVersion: version, buildId: cloned.buildId })
    } catch (error) {
      const failure = { schema: 2, status: 'failed', mode: 'consumer-only', applicationVersion: version, buildId: cloned.buildId, sourceBuildId: cloned.sourceBuildId, finishedAt: new Date().toISOString(), error: String(error?.message ?? error) }
      // Keep the inactive candidate and diagnostics; never move current.json on failure.
      await writeFile(join(stage, 'build-receipt.json'), JSON.stringify(failure, null, 2)).catch(() => undefined)
      await writeFile(join(stage, 'build-failure.json'), JSON.stringify(failure, null, 2)).catch(() => undefined)
      throw error
    }
  } else {
    // paths.cjs gives an explicit build ID precedence over current.json.
    // Initialize an inactive candidate without init-artifacts --new's early activation.
    process.env.ZEROWALL_BUILD_ID = `${Date.now()}-${randomUUID().slice(0, 8)}`
    fullStage = join(artifacts, 'stage', version, process.env.ZEROWALL_BUILD_ID)
    run(['artifacts:init'])
    run(['artifacts:links'])
    run(['version:check'])
    run(['plugins:generate'])
    run(['profiles:generate'])
    run(['dsh:verify'])
    execFileSync(process.execPath, [join(root, 'tools/build/build-graph.mjs'), 'components', ...(force ? ['--force'] : [])], { cwd: root, env: process.env, stdio: 'inherit' })
    execFileSync(process.execPath, [join(root, 'tools/build/prepare-native.mjs')], { cwd: root, env: process.env, stdio: 'inherit' })
    run(['dsh:runtime:closure'])
    execFileSync(process.execPath, [join(root, 'tools/packaging/verify-runtime-adapters.mjs')], { cwd: root, env: process.env, stdio: 'inherit' })
    const { assembleRuntime } = await import('./assembly-cache.mjs')
    for (const kind of ['core', 'offline']) await assembleRuntime(kind, (task, args = []) => run([task, ...args]))
    run(['resources:prepare'])
    execFileSync(process.execPath, [join(root, 'tools/packaging/write-runtime-integrity.mjs')], { cwd: root, env: process.env, stdio: 'inherit' })
    for (const task of ['commands:prepare', 'plugins:pack', 'catalogs:generate', 'runtime:profile:sign']) run([task])
    execFileSync(process.execPath, [join(root, 'tools/build/build-graph.mjs'), 'desktop'], { cwd: root, env: process.env, stdio: 'inherit' })
    const stage = join(artifacts, 'stage', version, process.env.ZEROWALL_BUILD_ID)
    await writeFile(join(stage, 'build-receipt.json'), JSON.stringify({ schema: 2, status: 'success', applicationVersion: version, buildId: process.env.ZEROWALL_BUILD_ID, pluginSnapshotId: await pluginSnapshotId(stage), finishedAt: new Date().toISOString() }, null, 2))
    const { activateStage } = await import('./clone-current-stage.mjs')
    await activateStage({ applicationVersion: version, buildId: process.env.ZEROWALL_BUILD_ID })
  }
} catch (error) {
  if (fullStage) {
    const failure = { schema: 2, status: 'failed', applicationVersion: version, buildId: process.env.ZEROWALL_BUILD_ID, finishedAt: new Date().toISOString(), error: String(error?.message ?? error) }
    await writeFile(join(fullStage, 'build-receipt.json'), JSON.stringify(failure, null, 2)).catch(() => undefined)
    await writeFile(join(fullStage, 'build-failure.json'), JSON.stringify(failure, null, 2)).catch(() => undefined)
  }
  throw error
} finally { await releaseBuildLock() }
