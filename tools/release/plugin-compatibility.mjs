import { satisfiesPackageRange } from '../commands/package-range.mjs'

/** Extend only an audited dependency edge; preserve immutable archive identity. */
export function applyAuditedPluginCompatibility(entries, rules, selectedPlugins, signEntry) {
  let result = entries
  for (const rule of rules) {
    if (!selectedPlugins.includes(rule.dependency)) continue
    const consumers = new Set(rule.consumers.map(entry => `${entry.id}@${entry.version}`))
    const dependency = result.find(entry => entry.id === rule.dependency)
    // A newer dependency with no historical consumer needs no old exception.
    // When selecting the audited dependency itself, however, every
    // incompatible edge must still match an explicitly reviewed consumer.
    if (dependency?.version !== rule.testedVersion) {
      if (result.some(entry => consumers.has(`${entry.id}@${entry.version}`) && entry.dependencies?.[rule.dependency])) throw new Error('Audited plugin compatibility requires its exact tested version')
      continue
    }
    result = result.map(entry => {
      const range = entry.dependencies?.[rule.dependency]
      if (!range || satisfiesPackageRange(dependency.version, range)) return entry
      if (!consumers.has(`${entry.id}@${entry.version}`) || range !== rule.previousRange) throw new Error('Unaudited plugin dependency edge: ' + entry.id)
      const { signature: _signature, ...payload } = entry
      return signEntry({ ...payload, dependencies: { ...entry.dependencies, [rule.dependency]: `${range} || ${rule.testedVersion}` } })
    })
  }
  return result
}
