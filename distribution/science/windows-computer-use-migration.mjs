/** Select the ZeroWall Windows computer-use bundle by default once per Desktop profile. */
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import semver from 'semver'
import { isMap, isSeq, parseDocument, visit } from 'yaml'
import science from './package.json' with { type: 'json' }

const legacy = 'dsh-computer-use-win'
const replacement = '@zerowall/dsh-computer-use-win'
const replacementVersion = science.optionalDependencies[replacement]

async function readPatch(path) {
  try {
    const original = await readFile(path, 'utf8')
    if (!original.includes(legacy)) return undefined
    const document = parseDocument(original, {
      customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }],
    })
    if (document.errors[0]) throw document.errors[0]
    if (!isSeq(document.contents)) return undefined
    let changed = false
    visit(document, {
      Map(_key, node) {
        if (isMap(node) && node.has('id') && node.get('name') === legacy) {
          node.set('name', replacement)
          changed = true
        }
      },
      Pair(_key, pair) {
        // Plugin config can contain its own application-specific name fields.
        if (pair.key?.value === 'config' && !isSeq(pair.value)) return visit.SKIP
      },
    })
    return changed ? { path, original, updated: String(document) } : undefined
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
}

async function saveMigration(path, original, updated) {
  try {
    await writeFile(path + '.before-windows-computer-use-migration', original, { flag: 'wx', mode: 0o600 })
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  await writeFileAtomic(path, updated, { mode: 0o600 })
}

/**
 * Enable the Windows plugin once and update older scoped copies without changing later user choices.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Running Desktop profile services.
 * @param {string} requestId - Plugin manager installation request used for cancellation.
 * @param {AbortSignal} signal - Cancels migration before committing the profile.
 * @returns {Promise<boolean>} Whether the saved profile needs a restart.
 */
export async function migrateWindowsComputerUse(ctx, requestId, signal) {
  const profile = ctx.profileContext
  const manifestPath = join(profile.dir, 'package.json')
  const current = JSON.parse(await readFile(manifestPath, 'utf8'))
  const wasOffered = current.zerowall?.defaultBundles?.includes(replacement) === true

  const inventory = await ctx.pluginManager.listBundles()
  const previous = inventory.find(bundle => bundle.name === legacy)
  const next = inventory.find(bundle => bundle.name === replacement)
  const bundled = next?.availability === 'installation'
  let restart = false
  if (!bundled && !next?.installed) {
    if (wasOffered) return false
    if (previous === undefined || (!previous.enabled && !previous.installed && previous.availability !== 'installation')) return false
    signal.throwIfAborted()
    const result = await ctx.pluginManager.installBundle(replacement + '@' + replacementVersion, {
      enabled: false, saveExact: true, requestId,
    })
    if (result.application === 'failed' || result.application === 'cancelled') {
      signal.throwIfAborted()
      throw new Error(result.error?.diagnostic ?? 'Could not install the replacement computer-use plugin.')
    }
  } else if (next?.installed && next.version !== undefined && semver.lt(next.version, replacementVersion)) {
    signal.throwIfAborted()
    const result = await ctx.pluginManager.updateBundle(replacement, replacementVersion, { requestId })
    if (result.result.application === 'failed' || result.result.application === 'cancelled') {
      signal.throwIfAborted()
      throw new Error(result.result.error?.diagnostic ?? 'Could not update the Windows computer-use plugin.')
    }
    restart = result.result.application === 'restart-required'
  }
  if (wasOffered) return restart
  return withFileLock(manifestPath, async () => {
    const original = await readFile(manifestPath, 'utf8')
    const manifest = JSON.parse(original)
    const bundles = manifest.dsh?.profile?.bundles ?? []
    const offered = manifest.zerowall?.defaultBundles ?? []
    if (offered.includes(replacement)) return restart
    if (!bundled && !Object.hasOwn(manifest.dependencies ?? {}, replacement)) throw new Error('The replacement computer-use plugin is missing.')
    const selectReplacement = names => [...new Set([...names.map(name => name === legacy ? replacement : name), replacement])]
    const patches = await Promise.all([...new Set([profile.patchPath, join(profile.home, 'cordis.patch.yml')])].map(readPatch))
    signal.throwIfAborted()
    for (const patch of patches) {
      if (patch !== undefined) await saveMigration(patch.path, patch.original, patch.updated)
    }
    manifest.dsh ??= {}
    manifest.dsh.profile ??= {}
    manifest.dsh.profile.bundles = selectReplacement(bundles)
    manifest.zerowall = { ...manifest.zerowall, defaultBundles: selectReplacement(offered) }
    if (manifest.dependencies) delete manifest.dependencies[legacy]
    if (manifest.optionalDependencies) delete manifest.optionalDependencies[legacy]
    await saveMigration(manifestPath, original, JSON.stringify(manifest, null, 2) + '\n')
    return restart || bundles.includes(legacy) || !bundles.includes(replacement) || patches.some(Boolean)
  }, { signal })
}

export const inject = ['profileContext', 'pluginManager']

/**
 * Stage the Windows package switch in the active Desktop profile.
 * @param {import('@deepseek-ai/cordis').Context} ctx - Cordis plugin context.
 */
export function apply(ctx) {
  if (process.platform !== 'win32' || ctx.profileContext.name !== 'desktop' || ctx.profileContext.packageManager === undefined) return
  ctx.effect(() => {
    const controller = new AbortController()
    const request = randomUUID()
    const migration = migrateWindowsComputerUse(ctx, request, controller.signal).then((restart) => {
      if (restart) ctx.logger.info('Windows computer use has switched to %s. Restart Desktop to load the replacement.', replacement)
    }).catch((error) => {
      if (!controller.signal.aborted) ctx.logger.warn('Windows computer-use migration failed. Restart Desktop to retry. %s', error.message)
    })
    return async () => {
      controller.abort()
      await ctx.pluginManager.cancelInstall(request)
      await migration
    }
  })
}
