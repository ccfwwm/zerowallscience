import paths from '../build/paths.cjs'
import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertPluginDesktopCompatibility } from '../plugins/compatibility.mjs'
import { verifyRuntimeIntegrity } from './runtime-integrity.mjs'
import { verifyOfflineProfile } from '../commands/offline-profile.mjs'
import { verifyCurrentRuntimeDependency } from '../commands/historical-plugin.mjs'
import { pluginRuntimeEntries } from '../commands/plugin-entrypoints.mjs'
import { runtimeRecipes } from '../build/runtime-recipes.mjs'

export async function verifyRuntimeFreshness(root, { allowDirty = process.env.ZEROWALL_ALLOW_DIRTY_DSH === '1' } = {}) {
  const { stage } = paths.buildPaths(root)
  const json = async file => JSON.parse(await readFile(resolve(root, file), 'utf8'))
  const pin = await json('config/deepseek-harness/upstream.json')
  const app = await json('package.json')
  const runtimeProfile = await json('config/layout/runtime-profile.json')
  const build = await json(`${stage}/dsh/build-receipt.json`)
  const runtime = await json(`${stage}/runtime/build-receipt.json`)
  const recipes = await runtimeRecipes(root)
  for (const folder of ['runtime', ...(runtimeProfile.optionalPluginPolicy?.offlineClosure ? ['offline-profile'] : [])]) {
    const receipt = await json(`${stage}/${folder}/build-receipt.json`)
    if (JSON.stringify(receipt.recipes) !== JSON.stringify(recipes)) throw new Error('Stale runtime adapters or upstream configuration. Run pnpm build before packaging.')
  }
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: resolve(root, 'deepseek-harness'), encoding: 'utf8' }).trim()
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: resolve(root, 'deepseek-harness'), encoding: 'utf8' }).trim()
  if (dirty && !allowDirty) throw new Error('Harness source changed since the pinned build. Commit and rebuild it before packaging.')
  for (const receipt of [build, runtime]) {
    if (head !== pin.commit || receipt.commit !== head || receipt.version !== pin.version || receipt.applicationVersion !== app.version || runtime.builtAt !== build.builtAt) {
      throw new Error('Stale Harness runtime: source, build, runtime, and release version must match. Run pnpm build.')
    }
  }
  let checked = 0
  for (const entry of await readdir(resolve(root, 'plugins'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'wechat') continue
    const source = resolve(root, 'plugins', entry.name)
    const manifestText = await readFile(join(source, 'package.json'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (manifestText === undefined) continue
    const manifest = JSON.parse(manifestText)
    // Upstream adapters are verified by the signed offline closure. Their
    // reviewed runtime intentionally differs from the original source.
    if (!manifest.name?.startsWith('@zerowallscience/plugin-')) continue
    const core = runtimeProfile.corePlugins.includes(manifest.name)
    if (!core && !runtimeProfile.optionalPluginPolicy?.bundled && !runtimeProfile.optionalPluginPolicy?.offlineClosure) continue
    const target = resolve(stage, core ? 'runtime/node_modules' : 'offline-profile/modules', manifest.name)
    assertPluginDesktopCompatibility(manifest.zerowall?.desktop, app.version, manifest.name)
    for (const file of ['package.json', 'zerowall.plugin.json', ...await nestedFiles(join(source, 'lib'), 'lib/')]) {
      if (!(await readFile(join(source, file))).equals(await readFile(join(target, file)))) {
        throw new Error(`Stale runtime: ${manifest.name}/${file}. Run pnpm build before packaging.`)
      }
      checked++
    }
  }
  await verifyRuntimeIntegrity(root, stage)
  if (runtimeProfile.optionalPluginPolicy?.offlineClosure) {
    const policy = await json('config/catalogs/plugin-verification.json')
    if (JSON.stringify(policy) !== JSON.stringify(await json(`${stage}/commands/plugin-verification.json`))) throw new Error('Stale packaged plugin verification policy. Run pnpm build.')
    const target = { desktopVersion: app.version, dshVersion: pin.version, dshCommit: pin.commit, platform: process.platform, architecture: process.arch }
    const { receipt } = await verifyOfflineProfile(join(stage, 'offline-profile'),
      await json('config/catalogs/trusted-keys.json'), target, { staging: true })
    const included = new Set(receipt.files.map(entry => entry.path))
    // Validate declared shared peers before creating an installer. A signed
    // plugin payload cannot supply a missing desktop-owned DSH package.
    for (const plugin of receipt.plugins.filter(entry => !entry.core)) {
      const manifest = await json(`${stage}/offline-profile/modules/${plugin.id}/package.json`)
      for (const entry of pluginRuntimeEntries(manifest)) {
        if (!included.has(`modules/${plugin.id}/${entry}`)) throw new Error(`Incomplete offline plugin runtime: ${plugin.id}/${entry}. Run pnpm build.`)
      }
      for (const [id, range] of Object.entries({ ...manifest.peerDependencies, ...manifest.dependencies, ...manifest.optionalDependencies })) {
        if (!id.startsWith('@deepseek-ai/')) continue
        await verifyCurrentRuntimeDependency({ id, range, runtimeModules: join(stage, 'runtime/node_modules'), target,
          optional: Boolean(manifest.optionalDependencies?.[id] || manifest.peerDependenciesMeta?.[id]?.optional) })
      }
    }
  }
  return { commit: head, version: app.version, checked }
}

async function nestedFiles(directory, prefix) {
  const result = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) result.push(...await nestedFiles(join(directory, entry.name), prefix + entry.name + '/'))
    else if (entry.isFile() && !/\.(?:map|d\.ts)$/u.test(entry.name)) result.push(prefix + entry.name)
  }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log('Runtime freshness verified:', await verifyRuntimeFreshness(resolve(import.meta.dirname, '../..')))
}
