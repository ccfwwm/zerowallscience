// Shared by profile initialization, transactions, legacy import and catalogs.
export const RETIRED_PLUGIN_IDS = new Set([
  'dsh-auto-review', '@zerowallscience/dsh-capability-menu',
  '@everclear077/dsh-progressive-tools', 'dsh-progressive-tools',
  'dsh-univer-office', 'dsh-genui', '@changfenhuang/dsh-genui',
])

export function retiredPackageSelector(selector) {
  if (typeof selector !== 'string') return false
  return selector.split('>').some(part => {
    // Yarn resolutions may prefix package selectors with **/ or an ancestor.
    // Consume scoped names together so @other/dsh-genui stays a distinct ID.
    const segments = part.trim().split('/')
    for (let index = 0; index < segments.length; index++) {
      const name = segments[index].startsWith('@') && index + 1 < segments.length ? segments[index] + '/' + segments[++index] : segments[index]
      if ([...RETIRED_PLUGIN_IDS].some(id => name === id || name.startsWith(id + '@'))) return true
    }
    return false
  })
}

/** Remove only retired selectors, retaining all unrelated resolver policy. */
export function removeRetiredResolutionRules(document) {
  let changed = false
  function clean(rules) {
    if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return
    for (const selector of Object.keys(rules)) {
      if (retiredPackageSelector(selector)) { delete rules[selector]; changed = true }
      else clean(rules[selector])
    }
  }
  clean(document.overrides)
  clean(document.resolutions)
  clean(document.pnpm?.overrides)
  return changed
}

export function removeRetiredPlugins(manifest) {
  const before = JSON.stringify(manifest)
  if (Array.isArray(manifest.dsh?.profile?.bundles)) manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter(id => !RETIRED_PLUGIN_IDS.has(id))
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const id of RETIRED_PLUGIN_IDS) if (manifest[field]) delete manifest[field][id]
  }
  if (Array.isArray(manifest.zerowall?.disabledPlugins)) manifest.zerowall.disabledPlugins = manifest.zerowall.disabledPlugins.filter(id => !RETIRED_PLUGIN_IDS.has(id))
  removeRetiredResolutionRules(manifest)
  return before !== JSON.stringify(manifest)
}

export function removeRetiredPatch(value) {
  if (Array.isArray(value)) return value.filter(row => !row || typeof row !== 'object' || !(RETIRED_PLUGIN_IDS.has(row.name) || RETIRED_PLUGIN_IDS.has(row.id) || ['univer', 'genui'].includes(row.id))).map(removeRetiredPatch)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, removeRetiredPatch(child)]))
}
